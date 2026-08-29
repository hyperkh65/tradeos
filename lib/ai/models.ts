import type { AIProviderType } from './types';

/**
 * 모델 이름을 코드 여기저기에 흩어놓지 않기 위한 단일 레지스트리.
 * 새 모델/프로바이더가 생기면 이 배열에만 추가하면 된다(UI/라우터는 이 목록을 참조).
 *
 * 2026-08-29 기준 기본값 교체: 무료 Neuron 한도를 빠르게 소진하던 70B 모델과
 * 한국어 검색 품질이 낮던 영어 전용 임베딩을 저비용/다국어 모델로 교체했다.
 * - 채팅: @cf/zai-org/glm-4.7-flash (경량, tools+streaming 지원)
 * - 임베딩: @cf/baai/bge-m3 (한국어/영어/중국어 다국어, 차원은 실제 embed 응답으로만 확정 — 하드코딩하지 않음)
 * - 리랭커: @cf/baai/bge-reranker-base (Qdrant 검색 결과 재정렬 전용, chat/embedding 아님)
 *
 * 구모델(llama-3.3-70b-instruct-fp8-fast, bge-base-en-v1.5)은 enabled:false로 남겨둔다 —
 * 기존 provider 행이 이 모델명을 참조 중이어도 라벨 조회가 깨지지 않고, 관리자가
 * 롤백 목적으로 수동 재선택도 가능해야 하기 때문(요구사항 35 — "무조건 삭제하지 않는다").
 */
export interface ModelCapability {
  provider: AIProviderType;
  modelId: string;
  label: string;
  chat: boolean;
  embedding: boolean;
  rerank: boolean;
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
    modelId: '@cf/zai-org/glm-4.7-flash',
    label: 'GLM-4.7-Flash',
    chat: true, embedding: false, rerank: false, vision: false, tools: true, streaming: true,
    maxContext: 24000, enabled: true,
  },
  {
    provider: 'cloudflare',
    modelId: '@cf/baai/bge-m3',
    label: 'BGE-M3 (다국어 임베딩)',
    chat: false, embedding: true, rerank: false, vision: false, tools: false, streaming: false,
    maxContext: 8192, enabled: true,
  },
  {
    provider: 'cloudflare',
    modelId: '@cf/baai/bge-reranker-base',
    label: 'BGE Reranker Base',
    chat: false, embedding: false, rerank: true, vision: false, tools: false, streaming: false,
    maxContext: 512, enabled: true,
  },
  {
    provider: 'cloudflare',
    modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B (fp8-fast, 레거시)',
    chat: true, embedding: false, rerank: false, vision: false, tools: true, streaming: true,
    maxContext: 24000, enabled: false,
  },
  {
    provider: 'cloudflare',
    modelId: '@cf/baai/bge-base-en-v1.5',
    label: 'BGE Base EN v1.5 (임베딩, 레거시)',
    chat: false, embedding: true, rerank: false, vision: false, tools: false, streaming: false,
    maxContext: 512, dimensions: 768, enabled: false,
  },
  {
    provider: 'openai', modelId: 'gpt-4o-mini', label: 'GPT-4o mini',
    chat: true, embedding: false, rerank: false, vision: false, tools: true, streaming: false, maxContext: 128000, enabled: true,
  },
  {
    provider: 'openai', modelId: 'text-embedding-3-small', label: 'Text Embedding 3 Small',
    chat: false, embedding: true, rerank: false, vision: false, tools: false, streaming: false, maxContext: 8191, dimensions: 1536, enabled: true,
  },
  {
    provider: 'anthropic', modelId: 'claude-sonnet-5', label: 'Claude Sonnet 5',
    chat: true, embedding: false, rerank: false, vision: false, tools: true, streaming: false, maxContext: 200000, enabled: true,
  },
  {
    provider: 'gemini', modelId: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash',
    chat: true, embedding: false, rerank: false, vision: false, tools: true, streaming: false, maxContext: 1000000, enabled: true,
  },
  {
    provider: 'gemini', modelId: 'text-embedding-004', label: 'Text Embedding 004',
    chat: false, embedding: true, rerank: false, vision: false, tools: false, streaming: false, maxContext: 2048, dimensions: 768, enabled: true,
  },
  {
    provider: 'ollama', modelId: 'llama3.1', label: 'Llama 3.1 (자체호스팅)',
    chat: true, embedding: false, rerank: false, vision: false, tools: true, streaming: false, maxContext: 128000, enabled: true,
  },
  {
    provider: 'ollama', modelId: 'nomic-embed-text', label: 'Nomic Embed Text (자체호스팅)',
    chat: false, embedding: true, rerank: false, vision: false, tools: false, streaming: false, maxContext: 8192, dimensions: 768, enabled: true,
  },
];

export const DEFAULT_CLOUDFLARE_CHAT_MODEL = '@cf/zai-org/glm-4.7-flash';
export const DEFAULT_CLOUDFLARE_EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const DEFAULT_CLOUDFLARE_RERANKER_MODEL = '@cf/baai/bge-reranker-base';

export function getModelsForProvider(provider: AIProviderType): ModelCapability[] {
  return MODEL_REGISTRY.filter(m => m.provider === provider && m.enabled);
}

export function findModel(provider: AIProviderType, modelId: string): ModelCapability | undefined {
  return MODEL_REGISTRY.find(m => m.provider === provider && m.modelId === modelId);
}
