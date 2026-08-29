import { listActiveProvidersOrderedByPriority, getAISettings, logUsage } from './db';

export interface RerankOutcome { order: number[]; scores: number[] }

/**
 * Qdrant 검색 결과를 그대로 LLM에 넘기지 않고 재정렬한다. bge-reranker-base는
 * Cloudflare Workers AI 전용 모델이라, 임베딩과 같은 계정 풀(같은 accountId/token)을
 * 우선순위 순으로 시도한다 — 별도 "리랭커 Provider" 개념을 새로 만들지 않고 기존
 * Provider 구조를 그대로 재사용한다. 전부 실패하면 null을 반환해서 호출자가 벡터
 * 스코어 순서를 그대로 쓰게 한다(전체 답변 실패로 이어지지 않는 안전한 폴백).
 */
export async function rerankTexts(query: string, texts: string[]): Promise<RerankOutcome | null> {
  if (texts.length === 0) return null;
  const settings = getAISettings();
  const model = settings.rerankerModel || '@cf/baai/bge-reranker-base';

  const candidates = listActiveProvidersOrderedByPriority()
    .filter(p => p.providerType === 'cloudflare' && p.supportsEmbedding && p.accountId && p.apiToken);

  for (const p of candidates) {
    const started = Date.now();
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${p.accountId}/ai/run/${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, contexts: texts.map(text => ({ text })) }),
      });
      if (!res.ok) { logUsage({ requestType: 'rerank', providerId: p.id, providerType: p.providerType, model, success: false, error: `HTTP ${res.status}`, latencyMs: Date.now() - started, ragChunks: texts.length }); continue; }
      const json = await res.json().catch(() => null) as
        { success?: boolean; result?: { response?: { id: number; score: number }[] } } | null;
      if (!json?.success || !json.result?.response?.length) { logUsage({ requestType: 'rerank', providerId: p.id, providerType: p.providerType, model, success: false, error: 'empty response', latencyMs: Date.now() - started, ragChunks: texts.length }); continue; }
      const ranked = [...json.result.response].sort((a, b) => b.score - a.score);
      logUsage({ requestType: 'rerank', providerId: p.id, providerType: p.providerType, model, success: true, latencyMs: Date.now() - started, rerankerCalls: 1, ragChunks: texts.length });
      return { order: ranked.map(r => r.id), scores: ranked.map(r => r.score) };
    } catch (e) {
      logUsage({ requestType: 'rerank', providerId: p.id, providerType: p.providerType, model, success: false, error: (e as Error).message, latencyMs: Date.now() - started, ragChunks: texts.length });
      continue; // 이 계정 실패 — 다음 계정으로
    }
  }
  return null;
}
