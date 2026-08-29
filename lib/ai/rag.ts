import { embedTexts } from './embeddings';
import { getQdrantConfig } from './qdrant-config';
import { qdrantSearch, type QdrantSearchHit } from './vectorstore/qdrant';
import { buildSourceDocument, type IndexableSourceType } from './sources';
import { getAISettings, getActiveVectorCollection } from './db';
import { rerankTexts } from './rerank';
import { getCachedQueryEmbedding, setCachedQueryEmbedding } from './query-cache';

export interface RagHit {
  sourceType: IndexableSourceType; sourceId: string; title: string; text: string;
  score: number; sourceUpdatedAt: string; businessId?: string;
}

/** Qdrant에서 1차로 가져오는 후보 수 — 이 중 관련도 threshold를 넘긴 것만 reranker로
 * 넘긴다(요구사항: top 10 → reranker → top 3~5). */
const QDRANT_FETCH_LIMIT = 10;

/**
 * Qdrant는 어디까지나 "찾아오는 용도"이고, 실제로 보여줄 내용은 항상 그룹웨어 DB에서
 * 다시 읽어온다 — (1) 인덱싱 이후 내용이 바뀌었으면 최신 DB 값이 이긴다,
 * (2) 삭제된 원본은 Qdrant에 흔적이 남아있어도 절대 다시 노출하지 않는다,
 * (3) 이 재조회 자체가 "실제 접근 가능한 문서인지" 서버에서 다시 검증하는 절차를 겸한다.
 *
 * 파이프라인: query embedding → Qdrant top 10(관련도 threshold 적용) → 소스별 최고점만
 * 남기고 dedup → reranker로 재정렬(rerank threshold 적용, 실패 시 벡터 순서 그대로 폴백)
 * → 상위 3~5개만 DB에서 다시 읽어와 반환.
 */
export async function searchKnowledge(query: string, opts?: { limit?: number }): Promise<RagHit[]> {
  const qdrantCfg = getQdrantConfig();
  if (!qdrantCfg) return [];

  const settings = getAISettings();
  const finalLimit = Math.min(opts?.limit ?? 5, settings.searchTopK || 5, 5);

  const expectedModel = getActiveVectorCollection()?.embeddingModel ?? '';
  const cached = getCachedQueryEmbedding(query, expectedModel);
  const queryVector = cached?.vector ?? (await (async () => {
    const embedResult = await embedTexts([query]);
    setCachedQueryEmbedding(query, embedResult.vectors[0], embedResult.model, embedResult.dimensions);
    return embedResult.vectors[0];
  })());

  const hits = (await qdrantSearch(qdrantCfg, queryVector, { limit: QDRANT_FETCH_LIMIT }))
    .filter(h => h.score >= settings.relevanceThreshold);

  const bestBySource = new Map<string, QdrantSearchHit>();
  for (const h of hits) {
    const key = `${h.payload.sourceType}:${h.payload.sourceId}`;
    const cur = bestBySource.get(key);
    if (!cur || cur.score < h.score) bestBySource.set(key, h);
  }
  let candidates = Array.from(bestBySource.values()).sort((a, b) => b.score - a.score);

  const reranked = await rerankTexts(query, candidates.map(c => String(c.payload.text ?? '')));
  if (reranked) {
    candidates = reranked.order
      .map((idx, i) => ({ hit: candidates[idx], score: reranked.scores[i] }))
      .filter(r => r.hit && r.score >= settings.rerankThreshold)
      .map(r => ({ ...r.hit, score: r.score }));
  }

  const top = candidates.slice(0, finalLimit);
  const results: RagHit[] = [];
  for (const hit of top) {
    const sourceType = hit.payload.sourceType as IndexableSourceType;
    const sourceId = hit.payload.sourceId as string;
    const liveDoc = await buildSourceDocument(sourceType, sourceId);
    if (!liveDoc) continue; // 인덱싱 이후 삭제된 원본 — 다시 노출하지 않음
    results.push({ sourceType, sourceId, title: liveDoc.title, text: liveDoc.text, score: hit.score, sourceUpdatedAt: liveDoc.sourceUpdatedAt, businessId: liveDoc.businessId });
  }
  return results;
}
