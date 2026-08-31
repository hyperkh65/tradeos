import { processNextPhotoJobs } from './thumbnail-job';
import { purgeExpiredTrash } from './trash';

const POLL_INTERVAL_MS = 10_000;
const TRASH_PURGE_INTERVAL_MS = 60 * 60_000;

/** lib/ai/worker.ts와 동일한 이유 — 별도 프로세스 없이 이 Next.js 서버 프로세스 안에서
 * setInterval로 충분(장수 프로세스 전제). instrumentation.ts에서 1회만 등록된다. */
export function startPhotoThumbnailWorker(): void {
  const g = globalThis as unknown as { __photoThumbnailWorkerStarted?: boolean };
  if (g.__photoThumbnailWorkerStarted) return;
  g.__photoThumbnailWorkerStarted = true;

  setInterval(() => {
    processNextPhotoJobs(5).catch(() => { /* 개별 실패는 이미 photo_jobs/photos.status에 기록됨 */ });
  }, POLL_INTERVAL_MS);

  // 휴지통 보관기간(관리자 설정, 기본 30일) 경과분 자동 영구삭제 — 썸네일만큼 자주 돌 필요 없어 1시간 간격.
  setInterval(() => {
    purgeExpiredTrash().catch(() => {});
  }, TRASH_PURGE_INTERVAL_MS);
}
