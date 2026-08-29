import {
  claimNextJobs, completeJob, failJob, type IndexJobRow,
  listVectorCollections, countJobsByStatus, activateVectorCollection, setVectorCollectionStatus,
} from './db';
import { indexOneSource, deleteOneSource } from './indexer';
import type { IndexableSourceType } from './sources';

async function runJob(job: IndexJobRow): Promise<void> {
  const sourceType = job.sourceType as IndexableSourceType;
  if (job.action === 'delete') {
    await deleteOneSource(sourceType, job.sourceId, job.targetCollectionId ?? undefined);
  } else {
    await indexOneSource(sourceType, job.sourceId, job.targetCollectionId ?? undefined);
  }
}

/** 큐에서 일정 개수만 꺼내 처리한다 — 워커 poll 주기마다 호출되며,
 * 한 번에 너무 많이 처리해 무료 임베딩 호출량을 한꺼번에 태우지 않도록 배치 크기를 제한한다. */
export async function processNextJobs(batchSize = 5): Promise<{ processed: number; failed: number }> {
  const jobs = claimNextJobs(batchSize);
  let failed = 0;
  for (const job of jobs) {
    try {
      await runJob(job);
      completeJob(job.id);
    } catch (e) {
      failJob(job.id, (e as Error).message);
      failed++;
    }
  }
  await checkAndActivatePendingMigrations();
  return { processed: jobs.length, failed };
}

/** 재인덱싱 마이그레이션(Phase 3)이 걸어둔 building 컬렉션들을 매 poll마다 확인한다 —
 * 해당 컬렉션 대상 잡이 전부 끝났고(pending/processing/retrying=0) 실패 없이 완료됐으면
 * 자동으로 active 전환(atomic switch), 실패가 남아있으면 failed로 표시해 admin이
 * 알아볼 수 있게 한다. UI를 안 보고 있어도(브라우저를 닫아도) 전환이 보장된다. */
async function checkAndActivatePendingMigrations(): Promise<void> {
  const building = listVectorCollections().filter(c => c.status === 'building');
  for (const col of building) {
    const counts = countJobsByStatus(col.id);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (total === 0) continue; // 아직 잡이 큐잉되지 않은 방금 생성된 컬렉션
    const inFlight = (counts.pending || 0) + (counts.processing || 0) + (counts.retrying || 0);
    if (inFlight > 0) continue;
    if ((counts.failed || 0) === 0) {
      activateVectorCollection(col.id);
    } else {
      setVectorCollectionStatus(col.id, 'failed');
    }
  }
}
