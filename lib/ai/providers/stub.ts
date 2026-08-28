import {
  AIProvider, AIProviderConfig, AIProviderError, AIProviderType, ChatMessage, ChatOptions,
  ChatResult, EmbedResult, ProviderUsageInfo,
} from '../types';

/**
 * Gemini/Claude/OpenAI/Ollama/OpenAI-호환 어댑터의 구조적 자리표시자.
 * admin 화면에서 provider를 "등록"만 해 둘 수 있게 인터페이스는 완전히 구현하되,
 * 실제 호출 시점에는 정직하게 "아직 연결되지 않음" 오류를 던진다 — 동작하는 척
 * 가짜 응답을 만들어내지 않는다. 실제 연동은 이 클래스를 벤더별 파일로 교체하면 된다.
 */
export class StubProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType: AIProviderType;

  constructor(config: AIProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.providerType = config.providerType;
  }

  private notImplemented(): never {
    throw new AIProviderError(
      `${this.providerType} 프로바이더는 아직 실제 연동이 구현되지 않았습니다. (등록만 가능, 관리자 설정에서 활성화하지 마세요)`,
      { retryable: false },
    );
  }

  async chat(_messages: ChatMessage[], _options?: ChatOptions): Promise<ChatResult> { this.notImplemented(); }
  async generate(_prompt: string, _options?: ChatOptions): Promise<ChatResult> { this.notImplemented(); }
  async embed(_texts: string[]): Promise<EmbedResult> { this.notImplemented(); }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: `${this.providerType}는 아직 구현되지 않은 어댑터입니다.` };
  }

  async getUsage(): Promise<ProviderUsageInfo> {
    return { estimatedRequestsToday: 0, note: '미구현 프로바이더' };
  }

  supportsStreaming() { return false; }
  supportsTools() { return false; }
  supportsEmbedding() { return false; }
  supportsVision() { return false; }
  supportsDocuments() { return false; }
}
