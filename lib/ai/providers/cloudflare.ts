import { AIProviderConfig, AIProviderError, AIProviderType, EmbedResult, ProviderUsageInfo } from '../types';
import { DEFAULT_CLOUDFLARE_CHAT_MODEL, DEFAULT_CLOUDFLARE_EMBEDDING_MODEL } from '../models';
import { OpenAIProvider } from './openai';

/**
 * Cloudflare Workers AI 어댑터. 채팅은 Cloudflare가 제공하는 OpenAI 호환 엔드포인트
 * (`accounts/{account_id}/ai/v1/chat/completions`)를 그대로 쓴다 — OpenAIProvider의
 * 요청/응답 파싱(도구 호출 포함)과 SSE 스트리밍을 고스란히 재사용할 수 있고, Cloudflare
 * REST API가 나중에 바뀌어도 이 파일 하나만 손보면 된다. 임베딩은 OpenAI 호환 범위 밖이라
 * Cloudflare 네이티브 `ai/run/{model}` 엔드포인트를 별도로 호출한다.
 */
export class CloudflareProvider extends OpenAIProvider {
  readonly providerType: AIProviderType = 'cloudflare';
  private readonly accountId: string;
  private readonly cfEmbeddingModel: string;

  constructor(config: AIProviderConfig) {
    if (!config.accountId) throw new AIProviderError('Cloudflare accountId가 설정되지 않았습니다.', { retryable: false });
    super({
      ...config,
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1`,
      chatModel: config.chatModel || DEFAULT_CLOUDFLARE_CHAT_MODEL,
    });
    this.accountId = config.accountId;
    this.cfEmbeddingModel = config.embeddingModel || DEFAULT_CLOUDFLARE_EMBEDDING_MODEL;
  }

  async embed(texts: string[]): Promise<EmbedResult> {
    let res: Response;
    try {
      res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.cfEmbeddingModel}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texts }),
      });
    } catch (e) {
      throw new AIProviderError(`Cloudflare 연결 실패: ${(e as Error).message}`, { retryable: true });
    }
    if (res.status === 429) throw new AIProviderError('Cloudflare rate limit(429)', { retryable: true, httpStatus: 429 });
    if (res.status === 401 || res.status === 403) throw new AIProviderError('Cloudflare 인증 실패(토큰/계정 확인 필요)', { retryable: false, httpStatus: res.status });
    if (res.status >= 500) throw new AIProviderError(`Cloudflare 서버 오류(${res.status})`, { retryable: true, httpStatus: res.status });

    const json = await res.json().catch(() => null) as { success: boolean; errors?: { message: string }[]; result?: { shape: number[]; data: number[][] } } | null;
    if (!res.ok || !json || json.success === false) {
      const msg = json?.errors?.map(e => e.message).join('; ') || `Cloudflare 임베딩 요청 실패(${res.status})`;
      throw new AIProviderError(msg, { retryable: res.status >= 500, httpStatus: res.status });
    }
    if (!json.result) throw new AIProviderError('Cloudflare 임베딩 응답에 result가 없습니다.', { retryable: true });
    return { vectors: json.result.data, model: this.cfEmbeddingModel, dimensions: json.result.shape?.[1] ?? (json.result.data[0]?.length || 0) };
  }

  async getUsage(): Promise<ProviderUsageInfo> {
    // Cloudflare는 계정별 무료 Neuron 사용량을 조회하는 단순 공개 API를 제공하지 않는다.
    // 여기서는 우리가 직접 기록한 ai_usage_logs 집계를 admin UI에서 보여주고,
    // 이 값은 "추정치"임을 명확히 표시한다(정확한 숫자인 척하지 않음).
    return { estimatedRequestsToday: 0, note: '실제 Neuron 사용량이 아닌, 자체 로그 기반 추정치입니다.' };
  }

  supportsEmbedding() { return true; }
}
