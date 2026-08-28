/**
 * 벤더 독립적인 AI Provider 계약. Cloudflare/Gemini/Claude/GPT/Ollama 등
 * 어떤 벤더를 붙이더라도 이 인터페이스만 구현하면 ProviderRouter가 그대로
 * 사용할 수 있어야 한다 — 벤더별 특수 로직이 이 인터페이스 밖으로 새어나가면 안 됨.
 */

export type AIProviderType =
  | 'cloudflare'
  | 'gemini'
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'openai_compatible';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolSchema[];
  signal?: AbortSignal;
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: ChatUsage;
  stream?: AsyncIterable<string>;
  toolCalls?: ToolCall[];
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  dimensions: number;
}

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'cooldown' | 'disabled' | 'error';

export interface ProviderHealth {
  status: ProviderHealthStatus;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  failureCount: number;
  cooldownUntil?: string | null;
  lastError?: string | null;
}

export interface ProviderUsageInfo {
  estimatedRequestsToday: number;
  note: string;
}

/** 재시도 가능(다른 provider로 failover)한 오류인지, 설정 오류(재시도 무의미)인지 구분 */
export class AIProviderError extends Error {
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(message: string, opts: { retryable: boolean; httpStatus?: number }) {
    super(message);
    this.name = 'AIProviderError';
    this.retryable = opts.retryable;
    this.httpStatus = opts.httpStatus;
  }
}

export interface AIProviderConfig {
  id: string;
  name: string;
  providerType: AIProviderType;
  accountId?: string | null;
  apiToken?: string | null;
  baseUrl?: string | null;
  chatModel?: string | null;
  embeddingModel?: string | null;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType: AIProviderType;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  generate(prompt: string, options?: ChatOptions): Promise<ChatResult>;
  embed(texts: string[]): Promise<EmbedResult>;
  healthCheck(): Promise<{ ok: boolean; message: string; retryable?: boolean }>;
  getUsage(): Promise<ProviderUsageInfo>;

  supportsStreaming(): boolean;
  supportsTools(): boolean;
  supportsEmbedding(): boolean;
  supportsVision(): boolean;
  supportsDocuments(): boolean;
}
