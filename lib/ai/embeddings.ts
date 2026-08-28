import crypto from 'crypto';
import { providerRouter } from './router';

/** 채팅 LLM Provider와 완전히 독립된 임베딩 경로 — ProviderRouter가 supportsEmbedding=true인
 * provider만 대상으로 우선순위/failover를 처리하므로, 이 함수는 임베딩 벤더를 전혀 몰라도 된다. */
export async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; model: string; dimensions: number; providerId: string }> {
  return providerRouter.embed(texts);
}

/** sourceType:sourceId:chunkIndex 같은 문자열 시드로부터 결정론적 UUID 형태 문자열을 만든다.
 * Qdrant point id는 정수 또는 UUID 문자열이어야 하는데, 같은 소스를 재인덱싱할 때
 * 항상 같은 id가 나와야 upsert가 "교체"로 동작한다(중복 누적 방지). */
export function deterministicPointId(seed: string): string {
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  return [
    hash.slice(0, 8), hash.slice(8, 12), '4' + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), hash.slice(20, 32),
  ].join('-');
}

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
