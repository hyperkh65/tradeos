import {
  AIProvider, AIProviderConfig, AIProviderError, ChatMessage, ChatOptions,
  ChatResult, EmbedResult, ProviderUsageInfo,
} from '../types';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_CHAT_MODEL = 'claude-sonnet-5';

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'thinking';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/** Anthropic Messages API 어댑터. system 프롬프트는 messages 배열이 아니라 최상위
 * `system` 필드로 분리해서 보내야 하고(다른 벤더와 다른 지점), 임베딩 API는 제공하지
 * 않으므로 supportsEmbedding=false로 정직하게 표시한다. */
export class AnthropicProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType = 'anthropic' as const;
  private readonly apiToken: string;
  private readonly chatModel: string;

  constructor(config: AIProviderConfig) {
    if (!config.apiToken) throw new AIProviderError('Anthropic API 토큰이 설정되지 않았습니다.', { retryable: false });
    this.id = config.id;
    this.name = config.name;
    this.apiToken = config.apiToken;
    this.chatModel = config.chatModel || DEFAULT_CHAT_MODEL;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const model = options?.model || this.chatModel;
    const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const convo = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model, max_tokens: options?.maxTokens || 1024, temperature: options?.temperature,
      system: systemText || undefined, messages: convo,
    };
    if (options?.tools?.length) {
      body.tools = options.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    }

    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'x-api-key': this.apiToken, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new AIProviderError(`Anthropic 연결 실패: ${(e as Error).message}`, { retryable: true });
    }
    if (res.status === 429) throw new AIProviderError('Anthropic rate limit(429)', { retryable: true, httpStatus: 429 });
    if (res.status === 401 || res.status === 403) throw new AIProviderError('Anthropic 인증 실패', { retryable: false, httpStatus: res.status });
    if (res.status >= 500) throw new AIProviderError(`Anthropic 서버 오류(${res.status})`, { retryable: true, httpStatus: res.status });

    const json = await res.json().catch(() => null) as {
      content?: AnthropicContentBlock[]; usage?: { input_tokens: number; output_tokens: number }; error?: { message?: string };
    } | null;
    if (!res.ok || !json) {
      throw new AIProviderError(json?.error?.message || `Anthropic 요청 실패(${res.status})`, { retryable: res.status >= 500, httpStatus: res.status });
    }

    const textBlocks = (json.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('\n');
    const toolBlocks = (json.content || []).filter(b => b.type === 'tool_use');
    return {
      content: textBlocks, model,
      usage: json.usage ? { promptTokens: json.usage.input_tokens, completionTokens: json.usage.output_tokens, totalTokens: json.usage.input_tokens + json.usage.output_tokens } : undefined,
      toolCalls: toolBlocks.length ? toolBlocks.map(b => ({ name: b.name || '', arguments: b.input || {} })) : undefined,
    };
  }

  async generate(prompt: string, options?: ChatOptions): Promise<ChatResult> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async embed(): Promise<EmbedResult> {
    throw new AIProviderError('Anthropic은 임베딩 API를 제공하지 않습니다. 임베딩 전용 provider를 별도로 등록하세요.', { retryable: false });
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
    return { estimatedRequestsToday: 0, note: '자체 로그 기반 추정치입니다(Anthropic 실시간 사용량 API 미사용).' };
  }

  supportsStreaming() { return false; }
  supportsTools() { return true; }
  supportsEmbedding() { return false; }
  supportsVision() { return false; }
  supportsDocuments() { return false; }
}
