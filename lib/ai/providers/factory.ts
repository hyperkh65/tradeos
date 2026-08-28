import { AIProvider, AIProviderConfig } from '../types';
import { CloudflareProvider } from './cloudflare';
import { OpenAIProvider } from './openai';
import { OpenAICompatibleProvider } from './openai-compatible';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';
import { StubProvider } from './stub';
import type { AIProviderRow } from '../db';

/** provider_type → 실제 어댑터 클래스 매핑. 새 벤더를 추가할 때 건드릴 곳은
 * 여기 한 줄과 새 어댑터 파일 하나뿐이어야 한다(다른 core 코드는 손대지 않음). */
export function createProviderInstance(row: AIProviderRow): AIProvider {
  const config: AIProviderConfig = {
    id: row.id,
    name: row.name,
    providerType: row.providerType,
    accountId: row.accountId,
    apiToken: row.apiToken,
    baseUrl: row.baseUrl,
    chatModel: row.chatModel,
    embeddingModel: row.embeddingModel,
  };

  switch (row.providerType) {
    case 'cloudflare':
      return new CloudflareProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'openai_compatible':
      return new OpenAICompatibleProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      return new StubProvider(config);
  }
}
