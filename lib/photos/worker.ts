import { processNextPhotoJobs } from './thumbnail-job';

const POLL_INTERVAL_MS = 10_000;

/** lib/ai/worker.ts와 동일한 이유 — 별도 프로세스 없이 이 Next.js 서버 프로세스 안에서
 * setInterval로 충분(장수 프로세스 전제). instrumentation.ts에서 1회만 등록된다. */
export function startPhotoThumbnailWorker(): void {
  const g = globalThis as unknown as { __photoThumbnailWorkerStarted?: boolean };
  if (g.__photoThumbnailWorkerStarted) return;
  g.__photoThumbnailWorkerStarted = true;

  setInterval(() => {
    processNextPhotoJobs(5).catch(() => { /* 개별 실패는 이미 photo_jobs/photos.status에 기록됨 */ });
  }, POLL_INTERVAL_MS);
}
