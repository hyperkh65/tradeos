import { AIProviderConfig, AIProviderError } from '../types';
import { OpenAIProvider } from './openai';

/** OpenAI Chat Completions와 동일한 스펙을 쓰는 제3의 서버(사내 vLLM, Groq, 기타 호환 API)를
 * 위한 어댑터 — OpenAIProvider와 요청/응답 형식이 완전히 같으므로 baseUrl 필수 여부만 다르게
 * 상속해서 재사용한다(로직 중복 없음). */
export class OpenAICompatibleProvider extends OpenAIProvider {
  readonly providerType = 'openai_compatible' as const;

  constructor(config: AIProviderConfig) {
    if (!config.baseUrl) throw new AIProviderError('OpenAI 호환 API의 Base URL이 설정되지 않았습니다.', { retryable: false });
    super({ ...config, apiToken: config.apiToken || 'unused' });
  }
}
