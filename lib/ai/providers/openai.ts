import {
  AIProvider, AIProviderConfig, AIProviderError, AIProviderType, ChatMessage, ChatOptions,
  ChatResult, EmbedResult, ProviderUsageInfo,
} from '../types';
import { parseOpenAISSEStream } from './sse';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** OpenAI Chat Completions / Embeddings REST 어댑터. baseUrl을 그대로 두면
 * OpenAI 공식 엔드포인트를, 다른 값을 넣으면 OpenAI 호환 서버(로컬 vLLM 등)를 가리킬 수 있다
 * (OpenAICompatibleProvider가 이 클래스를 상속해 재사용한다). */
export class OpenAIProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType: AIProviderType = 'openai';
  protected readonly baseUrl: string;
  protected readonly apiToken: string;
  protected readonly chatModel: string;
  protected readonly embeddingModel: string;

  constructor(config: AIProviderConfig) {
    if (!config.apiToken) throw new AIProviderError('OpenAI API 토큰이 설정되지 않았습니다.', { retryable: false });
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiToken = config.apiToken;
    this.chatModel = config.chatModel || DEFAULT_CHAT_MODEL;
    this.embeddingModel = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;
  }

  protected async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new AIProviderError(`${this.name} 연결 실패: ${(e as Error).message}`, { retryable: true });
    }
    if (res.status === 429) throw new AIProviderError(`${this.name} rate limit(429)`, { retryable: true, httpStatus: 429 });
    if (res.status === 401 || res.status === 403) throw new AIProviderError(`${this.name} 인증 실패`, { retryable: false, httpStatus: res.status });
    if (res.status >= 500) throw new AIProviderError(`${this.name} 서버 오류(${res.status})`, { retryable: true, httpStatus: res.status });
    const json = await res.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
    if (!res.ok || !json) {
      throw new AIProviderError(json?.error?.message || `${this.name} 요청 실패(${res.status})`, { retryable: res.status >= 500, httpStatus: res.status });
    }
    return json;
  }

  /** OpenAI 스펙: assistant가 도구를 호출했으면 그 tool_calls를 그대로 실어 보내야
   * 하고(id 포함), 뒤따르는 tool 메시지는 반드시 tool_call_id로 어떤 호출에 대한
   * 응답인지 명시해야 한다. 이게 없으면 모델이 tool 결과를 자기 질문과 연결 못 해서
   * 빈 응답을 내는 걸 Groq(qwen)에서 실사용 중 확인함(Cloudflare는 관대하게 봐줬음). */
  private toApiMessage(m: ChatMessage): Record<string, unknown> {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc, i) => ({
          id: tc.id || `call_${i}`,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
    return { role: m.role, content: m.content };
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const model = options?.model || this.chatModel;
    const body: Record<string, unknown> = {
      model,
      messages: messages.map(m => this.toApiMessage(m)),
      temperature: options?.temperature, max_tokens: options?.maxTokens,
    };
    if (options?.tools?.length) {
      body.tools = options.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    }

    // 도구 호출 판단(tool_calls) 여부는 완전한 응답을 봐야 알 수 있으므로, 도구가 함께
    // 전달된 요청은 스트리밍하지 않는다 — 스트리밍은 도구 없이 최종 답변만 생성할 때만 쓴다.
    if (options?.stream && !options?.tools?.length) {
      return this.chatStreaming(model, body, options?.signal);
    }

    const result = await this.request<{
      choices: { message: { content: string | null; tool_calls?: { id?: string; function: { name: string; arguments: string } }[] } }[];
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    }>('/chat/completions', body);
    const msg = result.choices[0]?.message;
    return {
      content: msg?.content ?? '',
      model,
      usage: result.usage ? { promptTokens: result.usage.prompt_tokens, completionTokens: result.usage.completion_tokens, totalTokens: result.usage.total_tokens } : undefined,
      toolCalls: msg?.tool_calls?.length
        ? msg.tool_calls.map(tc => ({ id: tc.id, name: tc.function.name, arguments: safeParseJson(tc.function.arguments) }))
        : undefined,
    };
  }

  private async chatStreaming(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ChatResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, stream: true }),
        signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new AIProviderError('사용자가 응답 생성을 중단했습니다.', { retryable: false });
      throw new AIProviderError(`${this.name} 연결 실패: ${(e as Error).message}`, { retryable: true });
    }
    if (res.status === 429) throw new AIProviderError(`${this.name} rate limit(429)`, { retryable: true, httpStatus: 429 });
    if (res.status === 401 || res.status === 403) throw new AIProviderError(`${this.name} 인증 실패`, { retryable: false, httpStatus: res.status });
    if (res.status >= 500) throw new AIProviderError(`${this.name} 서버 오류(${res.status})`, { retryable: true, httpStatus: res.status });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new AIProviderError(errJson?.error?.message || `${this.name} 요청 실패(${res.status})`, { retryable: false, httpStatus: res.status });
    }
    return { content: '', model, stream: parseOpenAISSEStream(res) };
  }

  async generate(prompt: string, options?: ChatOptions): Promise<ChatResult> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async embed(texts: string[]): Promise<EmbedResult> {
    const result = await this.request<{ data: { embedding: number[] }[]; model: string }>('/embeddings', {
      model: this.embeddingModel, input: texts,
    });
    return { vectors: result.data.map(d => d.embedding), model: this.embeddingModel, dimensions: result.data[0]?.embedding.length || 0 };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string; retryable?: boolean }> {
    try {
      const result = await this.chat([{ role: 'user', content: 'ping' }], { maxTokens: 4 });
      return { ok: true, message: `정상 응답 (모델: ${result.model})` };
    } catch (e) {
      return { ok: false, message: (e as Error).message, retryable: e instanceof AIProviderError ? e.retryable : false };
    }
  }

  async getUsage(): Promise<ProviderUsageInfo> {
    return { estimatedRequestsToday: 0, note: '이 벤더는 계정별 실시간 사용량 조회 API를 제공하지 않아, 자체 로그 기반 추정치만 제공합니다.' };
  }

  supportsStreaming() { return true; }
  supportsTools() { return true; }
  supportsEmbedding() { return true; }
  supportsVision() { return false; }
  supportsDocuments() { return false; }
}

function safeParseJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}
