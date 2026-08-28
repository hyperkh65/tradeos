import { embedTexts } from './embeddings';
import { getQdrantConfig } from './qdrant-config';
import { qdrantSearch, type QdrantSearchHit } from './vectorstore/qdrant';
import { buildSourceDocument, type IndexableSourceType } from './sources';

export interface RagHit {
  sourceType: IndexableSourceType; sourceId: string; title: string; text: string;
  score: number; sourceUpdatedAt: string; businessId?: string;
}

/** 코사인 유사도 기준 최소 관련도 — 이 밑이면 "그나마 가까운" 정도라 답에 근거로 쓰면
 * 안 된다(엉뚱한 제품/거래를 출처인 척 보여주는 걸 방지). 임베딩 모델이 바뀌면 실제
 * 점수 분포를 보고 다시 튜닝해야 하는 값이라, 이 파일 한 곳에서만 관리한다. */
const MIN_RELEVANCE_SCORE = 0.5;

/**
 * Qdrant는 어디까지나 "찾아오는 용도"이고, 실제로 보여줄 내용은 항상 그룹웨어 DB에서
 * 다시 읽어온다 — (1) 인덱싱 이후 내용이 바뀌었으면 최신 DB 값이 이긴다,
 * (2) 삭제된 원본은 Qdrant에 흔적이 남아있어도 절대 다시 노출하지 않는다,
 * (3) 이 재조회 자체가 "실제 접근 가능한 문서인지" 서버에서 다시 검증하는 절차를 겸한다.
 */
export async function searchKnowledge(query: string, opts?: { limit?: number }): Promise<RagHit[]> {
  const qdrantCfg = getQdrantConfig();
  if (!qdrantCfg) return [];

  const limit = opts?.limit ?? 8;
  const embedResult = await embedTexts([query]);
  const hits = (await qdrantSearch(qdrantCfg, embedResult.vectors[0], { limit: limit * 3 }))
    .filter(h => h.score >= MIN_RELEVANCE_SCORE);

  const bestBySource = new Map<string, QdrantSearchHit>();
  for (const h of hits) {
    const key = `${h.payload.sourceType}:${h.payload.sourceId}`;
    const cur = bestBySource.get(key);
    if (!cur || cur.score < h.score) bestBySource.set(key, h);
  }

  const results: RagHit[] = [];
  for (const hit of bestBySource.values()) {
    const sourceType = hit.payload.sourceType as IndexableSourceType;
    const sourceId = hit.payload.sourceId as string;
    const liveDoc = await buildSourceDocument(sourceType, sourceId);
    if (!liveDoc) continue; // 인덱싱 이후 삭제된 원본 — 다시 노출하지 않음
    results.push({ sourceType, sourceId, title: liveDoc.title, text: liveDoc.text, score: hit.score, sourceUpdatedAt: liveDoc.sourceUpdatedAt, businessId: liveDoc.businessId });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
