import { sha256 } from './embeddings';

/** 동일(또는 정규화 후 동일) 질의의 반복 검색에 매번 새로 embedding을 호출하지 않기
 * 위한 in-process TTL 캐시. worker.ts가 별도 Redis 없이 in-process setInterval을
 * 쓰는 것과 같은 이유(단일 장수 Node 프로세스라 별도 인프라가 불필요) — 문서 임베딩은
 * 이미 content-hash로 재사용하므로(indexer.ts), 여기서는 "질의 임베딩"만 대상으로 한다. */
interface CacheEntry { vector: number[]; model: string; dimensions: number; expiresAt: number }

const TTL_MS = 10 * 60 * 1000; // 10분
const cache = new Map<string, CacheEntry>();

function cacheKey(query: string, model: string): string {
  // 모델을 키에 포함시켜서, embedding 모델이 바뀌면(v1→v2 재인덱싱 전환 등) 예전
  // 모델로 만든 벡터가 새 컬렉션 검색에 잘못 재사용되지 않고 자동으로 캐시 미스가 난다.
  return sha256(`${model}:${query.trim().toLowerCase().replace(/\s+/g, ' ')}`);
}

export function getCachedQueryEmbedding(query: string, model: string): { vector: number[]; model: string; dimensions: number } | null {
  const key = cacheKey(query, model);
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) { cache.delete(key); return null; }
  return hit;
}

export function setCachedQueryEmbedding(query: string, vector: number[], model: string, dimensions: number): void {
  const key = cacheKey(query, model);
  cache.set(key, { vector, model, dimensions, expiresAt: Date.now() + TTL_MS });
  // 무한정 커지지 않게 — 캐시가 너무 커지면 가장 오래된 것부터 정리(간단한 크기 상한).
  if (cache.size > 500) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}
