import type { AIProviderType } from './types';

/**
 * 모델 이름을 코드 여기저기에 흩어놓지 않기 위한 단일 레지스트리.
 * 새 모델/프로바이더가 생기면 이 배열에만 추가하면 된다(UI/라우터는 이 목록을 참조).
 *
 * cloudflare 기본값은 2026-08-28 기준 Cloudflare Workers AI 문서로 확인:
 * - 채팅: @cf/meta/llama-3.3-70b-instruct-fp8-fast (무료 일일 한도 내 사용 가능, tools+streaming 지원, 24K 컨텍스트)
 * - 임베딩: @cf/baai/bge-base-en-v1.5 (무료 한도 내 사용 가능, 768차원)
 * llama-3.1-8b-instruct는 2026-05-30부로 deprecated되어 기본값에서 제외함.
 */
export interface ModelCapability {
  provider: AIProviderType;
  modelId: string;
  label: string;
  chat: boolean;
  embedding: boolean;
  vision: boolean;
  tools: boolean;
  streaming: boolean;
  maxContext: number;
  dimensions?: number;
  enabled: boolean;
}

export const MODEL_REGISTRY: ModelCapability[] = [
  {
    provider: 'cloudflare',
    modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B (fp8-fast)',
    chat: true, embedding: false, vision: false, tools: true, streaming: true,
    maxContext: 24000, enabled: true,
  },
  {
    provider: 'cloudflare',
    modelId: '@cf/baai/bge-base-en-v1.5',
    label: 'BGE Base EN v1.5 (임베딩)',
    chat: false, embedding: true, vision: false, tools: false, streaming: false,
    maxContext: 512, dimensions: 768, enabled: true,
  },
  {
    provider: 'openai', modelId: 'gpt-4o-mini', label: 'GPT-4o mini',
    chat: true, embedding: false, vision: false, tools: true, streaming: false, maxContext: 128000, enabled: true,
  },
  {
    provider: 'openai', modelId: 'text-embedding-3-small', label: 'Text Embedding 3 Small',
    chat: false, embedding: true, vision: false, tools: false, streaming: false, maxContext: 8191, dimensions: 1536, enabled: true,
  },
  {
    provider: 'anthropic', modelId: 'claude-sonnet-5', label: 'Claude Sonnet 5',
    chat: true, embedding: false, vision: false, tools: true, streaming: false, maxContext: 200000, enabled: true,
  },
  {
    provider: 'gemini', modelId: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash',
    chat: true, embedding: false, vision: false, tools: true, streaming: false, maxContext: 1000000, enabled: true,
  },
  {
    provider: 'gemini', modelId: 'text-embedding-004', label: 'Text Embedding 004',
    chat: false, embedding: true, vision: false, tools: false, streaming: false, maxContext: 2048, dimensions: 768, enabled: true,
  },
  {
    provider: 'ollama', modelId: 'llama3.1', label: 'Llama 3.1 (자체호스팅)',
    chat: true, embedding: false, vision: false, tools: true, streaming: false, maxContext: 128000, enabled: true,
  },
  {
    provider: 'ollama', modelId: 'nomic-embed-text', label: 'Nomic Embed Text (자체호스팅)',
    chat: false, embedding: true, vision: false, tools: false, streaming: false, maxContext: 8192, dimensions: 768, enabled: true,
  },
];

export const DEFAULT_CLOUDFLARE_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const DEFAULT_CLOUDFLARE_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;

export function getModelsForProvider(provider: AIProviderType): ModelCapability[] {
  return MODEL_REGISTRY.filter(m => m.provider === provider && m.enabled);
}

export function findModel(provider: AIProviderType, modelId: string): ModelCapability | undefined {
  return MODEL_REGISTRY.find(m => m.provider === provider && m.modelId === modelId);
}
