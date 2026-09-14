import { AIProviderError, ChatMessage, ChatOptions, ChatResult, EmbedResult } from './types';
import { listActiveProvidersOrderedByPriority, recordProviderSuccess, recordProviderFailure, logUsage, type AIProviderRow } from './db';
import { createProviderInstance } from './providers/factory';

/** AI Provider 연결의 단일 진입점 — 우선순위 순서로 시도하고, 재시도 가능한 오류만
 * 다음 provider로 failover한다. 이 파일은 특정 벤더를 전혀 몰라야 한다(팩토리를 통해서만 접근). */
export class ProviderRouter {
  private eligible(rows: AIProviderRow[], need: 'chat' | 'embedding'): AIProviderRow[] {
    const now = Date.now();
    return rows
      .filter(r => need === 'chat' ? r.supportsChat : r.supportsEmbedding)
      .filter(r => r.status !== 'disabled' && r.status !== 'error')
      .filter(r => !r.cooldownUntil || new Date(r.cooldownUntil).getTime() <= now);
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
    ctx?: { conversationId?: string; messageId?: string; userId?: string; userName?: string },
  ): Promise<ChatResult & { providerId: string; providerName: string }> {
    // 로컬 소형 모델(Ollama)은 도구 호출이 필요한 라운드에서 신뢰도가 낮다는 게
    // 실사용 중 확인됨 — 일부 모델(gemma2 등)은 tools 파라미터 자체를 거부해 API
    // 레벨에서 에러가 나고, 일부(llama3.2 등)는 실제로 도구를 호출하는 대신 "~하겠습니다"
    // 라고 말로만 서술하고 끝내버림. 도구가 필요 없는 일반 대화/최종 답변 합성
    // 라운드에서만 쓰고, 도구가 딸린 라운드에서는 후보에서 아예 제외해 안정적인
    // 공급자로 바로 넘어가게 한다.
    const rows = this.eligible(listActiveProvidersOrderedByPriority(), 'chat')
      .filter(r => !(options?.tools?.length && r.providerType === 'ollama'));
    if (rows.length === 0) {
      throw new AIProviderError('사용 가능한 AI Provider가 없습니다(모두 비활성/쿨다운/오류 상태).', { retryable: false });
    }

    let lastError: Error | null = null;
    let fallbackFrom: string | undefined;
    for (const row of rows) {
      const started = Date.now();
      try {
        const instance = createProviderInstance(row);
        const result = await instance.chat(messages, options);
        recordProviderSuccess(row.id);
        logUsage({
          conversationId: ctx?.conversationId, messageId: ctx?.messageId, userId: ctx?.userId, userName: ctx?.userName,
          providerId: row.id, providerType: row.providerType, model: result.model,
          requestType: 'chat', success: true, latencyMs: Date.now() - started, fallbackFromProviderId: fallbackFrom,
        });
        return { ...result, providerId: row.id, providerName: row.name };
      } catch (e) {
        const err = e instanceof AIProviderError ? e : new AIProviderError((e as Error).message, { retryable: true });
        recordProviderFailure(row.id, { retryable: err.retryable, message: err.message });
        logUsage({
          conversationId: ctx?.conversationId, messageId: ctx?.messageId, userId: ctx?.userId, userName: ctx?.userName,
          providerId: row.id, providerType: row.providerType, model: row.chatModel || undefined,
          requestType: 'chat', success: false, error: err.message, latencyMs: Date.now() - started, fallbackFromProviderId: fallbackFrom,
        });
        lastError = err;
        fallbackFrom = row.id;
        if (!err.retryable) continue; // 설정 오류도 다음 provider로는 넘어가되, 재시도 대상에서는 제외됨(already cooldown 미적용)
      }
    }
    throw lastError || new AIProviderError('모든 AI Provider 호출에 실패했습니다.', { retryable: false });
  }

  async embed(texts: string[]): Promise<EmbedResult & { providerId: string; providerName: string }> {
    const rows = this.eligible(listActiveProvidersOrderedByPriority(), 'embedding');
    if (rows.length === 0) {
      throw new AIProviderError('사용 가능한 Embedding Provider가 없습니다.', { retryable: false });
    }

    let lastError: Error | null = null;
    for (const row of rows) {
      const started = Date.now();
      try {
        const instance = createProviderInstance(row);
        const result = await instance.embed(texts);
        recordProviderSuccess(row.id);
        logUsage({ providerId: row.id, providerType: row.providerType, model: result.model, requestType: 'embed', success: true, latencyMs: Date.now() - started });
        return { ...result, providerId: row.id, providerName: row.name };
      } catch (e) {
        const err = e instanceof AIProviderError ? e : new AIProviderError((e as Error).message, { retryable: true });
        recordProviderFailure(row.id, { retryable: err.retryable, message: err.message });
        logUsage({ providerId: row.id, providerType: row.providerType, requestType: 'embed', success: false, error: err.message, latencyMs: Date.now() - started });
        lastError = err;
      }
    }
    throw lastError || new AIProviderError('모든 Embedding Provider 호출에 실패했습니다.', { retryable: false });
  }
}

export const providerRouter = new ProviderRouter();
