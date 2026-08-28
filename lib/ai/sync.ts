import { enqueueIndexJob } from './db';
import type { IndexableSourceType } from './sources';

/** 기존 그룹웨어 API 라우트 끝에 한 줄만 추가해서 호출한다. AI 인덱싱은
 * 어디까지나 보조 기능이므로, 큐 적재가 실패해도 절대 본 요청(제품/검품/클레임 저장)을
 * 실패시키면 안 된다 — 항상 조용히 무시한다. */
export function syncIndexOnWrite(sourceType: IndexableSourceType, sourceId: string): void {
  try { enqueueIndexJob(sourceType, sourceId, 'update'); } catch { /* AI 인덱싱은 보조 기능 — 본 요청에 영향 없음 */ }
}

export function syncIndexOnDelete(sourceType: IndexableSourceType, sourceId: string): void {
  try { enqueueIndexJob(sourceType, sourceId, 'delete'); } catch { /* AI 인덱싱은 보조 기능 — 본 요청에 영향 없음 */ }
}
