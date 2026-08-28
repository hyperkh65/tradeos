import {
  AIProvider, AIProviderConfig, AIProviderError, ChatMessage, ChatOptions,
  ChatResult, EmbedResult, ProviderUsageInfo,
} from '../types';

const DEFAULT_CHAT_MODEL = 'llama3.1';
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

/** 자체 호스팅 Ollama 서버 어댑터. NAS 등 내부망에서 돌리는 걸 전제로 하므로
 * 토큰 인증이 없을 수 있다(관리자가 API 토큰을 비워두면 인증 헤더 없이 호출). */
export class OllamaProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType = 'ollama' as const;
  private readonly baseUrl: string;
  private readonly apiToken: string | null;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(config: AIProviderConfig) {
    if (!config.baseUrl) throw new AIProviderError('Ollama Base URL이 설정되지 않았습니다.', { retryable: false });
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiToken = config.apiToken || null;
    this.chatModel = config.chatModel || DEFAULT_CHAT_MODEL;
    this.embeddingModel = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}) },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new AIProviderError(`Ollama(${this.baseUrl}) 연결 실패: ${(e as Error).message}`, { retryable: true });
    }
    if (res.status === 401 || res.status === 403) throw new AIProviderError('Ollama 인증 실패', { retryable: false, httpStatus: res.status });
    if (res.status === 404) throw new AIProviderError('Ollama 모델을 찾을 수 없습니다(먼저 서버에 모델을 pull 했는지 확인).', { retryable: false, httpStatus: 404 });
    if (res.status >= 500) throw new AIProviderError(`Ollama 서버 오류(${res.status})`, { retryable: true, httpStatus: res.status });
    const json = await res.json().catch(() => null) as (T & { error?: string }) | null;
    if (!res.ok || !json) {
      throw new AIProviderError(json?.error || `Ollama 요청 실패(${res.status})`, { retryable: res.status >= 500, httpStatus: res.status });
    }
    return json;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const model = options?.model || this.chatModel;
    const body: Record<string, unknown> = {
      model, messages: messages.map(m => ({ role: m.role, content: m.content })), stream: false,
      options: { temperature: options?.temperature, num_predict: options?.maxTokens },
    };
    if (options?.tools?.length) {
      body.tools = options.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    }
    const result = await this.request<{
      message: { content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[] };
      prompt_eval_count?: number; eval_count?: number;
    }>('/api/chat', body);
    return {
      content: result.message?.content ?? '', model,
      usage: (result.prompt_eval_count || result.eval_count) ? { promptTokens: result.prompt_eval_count, completionTokens: result.eval_count, totalTokens: (result.prompt_eval_count || 0) + (result.eval_count || 0) } : undefined,
      toolCalls: result.message?.tool_calls?.length ? result.message.tool_calls.map(tc => ({ name: tc.function.name, arguments: tc.function.arguments || {} })) : undefined,
    };
  }

  async generate(prompt: string, options?: ChatOptions): Promise<ChatResult> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async embed(texts: string[]): Promise<EmbedResult> {
    const result = await this.request<{ embeddings: number[][] }>('/api/embed', { model: this.embeddingModel, input: texts });
    return { vectors: result.embeddings, model: this.embeddingModel, dimensions: result.embeddings[0]?.length || 0 };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await this.chat([{ role: 'user', content: 'ping' }], { maxTokens: 4 });
      return { ok: true, message: `정상 응답 (모델: ${result.model})` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async getUsage(): Promise<ProviderUsageInfo> {
    return { estimatedRequestsToday: 0, note: '자체 호스팅 서버는 별도 사용량 과금이 없어 추정치를 제공하지 않습니다.' };
  }

  supportsStreaming() { return false; }
  supportsTools() { return true; }
  supportsEmbedding() { return true; }
  supportsVision() { return false; }
  supportsDocuments() { return false; }
}
