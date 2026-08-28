import { claimNextJobs, completeJob, failJob, type IndexJobRow } from './db';
import { indexOneSource, deleteOneSource } from './indexer';
import type { IndexableSourceType } from './sources';

async function runJob(job: IndexJobRow): Promise<void> {
  const sourceType = job.sourceType as IndexableSourceType;
  if (job.action === 'delete') {
    await deleteOneSource(sourceType, job.sourceId);
  } else {
    await indexOneSource(sourceType, job.sourceId);
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
  return { processed: jobs.length, failed };
}
