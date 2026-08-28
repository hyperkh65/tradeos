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
    const rows = this.eligible(listActiveProvidersOrderedByPriority(), 'chat');
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
