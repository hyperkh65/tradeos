import {
  AIProvider, AIProviderConfig, AIProviderError, ChatMessage, ChatOptions,
  ChatResult, EmbedResult, ProviderUsageInfo,
} from '../types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_CHAT_MODEL = 'gemini-3.7-flash';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-004';

interface GeminiPart { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }

/** Google Gemini generateContent REST 어댑터. 인증은 헤더가 아니라 쿼리스트링 `?key=`로
 * 전달하는 것이 이 벤더만의 특이점(다른 4개 벤더는 전부 헤더 인증). */
export class GeminiProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType = 'gemini' as const;
  private readonly apiToken: string;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(config: AIProviderConfig) {
    if (!config.apiToken) throw new AIProviderError('Gemini API 키가 설정되지 않았습니다.', { retryable: false });
    this.id = config.id;
    this.name = config.name;
    this.apiToken = config.apiToken;
    this.chatModel = config.chatModel || DEFAULT_CHAT_MODEL;
    this.embeddingModel = config.embeddingModel || DEFAULT_EMBEDDING_MODEL;
  }

  private async request<T>(model: string, method: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/models/${model}:${method}?key=${encodeURIComponent(this.apiToken)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch (e) {
      throw new AIProviderError(`Gemini 연결 실패: ${(e as Error).message}`, { retryable: true });
    }
    if (res.status === 429) throw new AIProviderError('Gemini rate limit(429)', { retryable: true, httpStatus: 429 });
    if (res.status === 401 || res.status === 403) throw new AIProviderError('Gemini 인증 실패', { retryable: false, httpStatus: res.status });
    if (res.status >= 500) throw new AIProviderError(`Gemini 서버 오류(${res.status})`, { retryable: true, httpStatus: res.status });
    const json = await res.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
    if (!res.ok || !json) {
      throw new AIProviderError(json?.error?.message || `Gemini 요청 실패(${res.status})`, { retryable: res.status >= 500, httpStatus: res.status });
    }
    return json;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const model = options?.model || this.chatModel;
    const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
      generationConfig: { temperature: options?.temperature, maxOutputTokens: options?.maxTokens },
    };
    if (options?.tools?.length) {
      body.tools = [{ functionDeclarations: options.tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
    }

    const result = await this.request<{
      candidates?: { content?: { parts?: GeminiPart[] } }[];
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
    }>(model, 'generateContent', body);

    const parts = result.candidates?.[0]?.content?.parts || [];
    const text = parts.filter(p => p.text).map(p => p.text).join('');
    const calls = parts.filter(p => p.functionCall).map(p => ({ name: p.functionCall!.name, arguments: p.functionCall!.args || {} }));
    return {
      content: text, model,
      usage: result.usageMetadata ? { promptTokens: result.usageMetadata.promptTokenCount, completionTokens: result.usageMetadata.candidatesTokenCount, totalTokens: result.usageMetadata.totalTokenCount } : undefined,
      toolCalls: calls.length ? calls : undefined,
    };
  }

  async generate(prompt: string, options?: ChatOptions): Promise<ChatResult> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async embed(texts: string[]): Promise<EmbedResult> {
    // Gemini embedContent는 텍스트 1건씩만 받으므로 순차 호출로 배치를 흉내낸다.
    const vectors: number[][] = [];
    for (const text of texts) {
      const result = await this.request<{ embedding: { values: number[] } }>(this.embeddingModel, 'embedContent', {
        content: { parts: [{ text }] },
      });
      vectors.push(result.embedding.values);
    }
    return { vectors, model: this.embeddingModel, dimensions: vectors[0]?.length || 0 };
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
    return { estimatedRequestsToday: 0, note: '자체 로그 기반 추정치입니다(Gemini 실시간 사용량 API 미사용).' };
  }

  supportsStreaming() { return false; }
  supportsTools() { return true; }
  supportsEmbedding() { return true; }
  supportsVision() { return false; }
  supportsDocuments() { return false; }
}
