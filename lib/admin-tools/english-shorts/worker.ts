import { processNextRenderJobs } from './render-job';

const POLL_INTERVAL_MS = 10_000;

/** 사진첩 lib/photos/worker.ts와 동일한 이유 — 별도 프로세스 없이 이 Next.js
 * 서버 프로세스 안에서 setInterval로 충분(장수 프로세스 전제). instrumentation.ts
 * 에서 1회만 등록된다(globalThis 재진입 가드로 hot-reload/중복 register() 방지). */
export function startEnglishShortsRenderWorker(): void {
  const g = globalThis as unknown as { __englishShortsRenderWorkerStarted?: boolean };
  if (g.__englishShortsRenderWorkerStarted) return;
  g.__englishShortsRenderWorkerStarted = true;

  setInterval(() => {
    processNextRenderJobs().catch(e => console.error('[english-shorts render worker]', e));
  }, POLL_INTERVAL_MS);
}
