import { processNextRenderJobs } from './render-job';

const POLL_INTERVAL_MS = 10_000;

type WorkerGlobal = { __englishShortsRenderWorkerStarted?: boolean; __englishShortsWorkerLastTickAt?: string };

/** Health Check(Phase 16)가 "워커가 실제로 살아있는지"를 판단하는 데 쓰는
 * 값 — tick마다(성공/실패 무관) 실제 타임스탬프를 남긴다. */
export function getWorkerLastTickAt(): string | null {
  return (globalThis as unknown as WorkerGlobal).__englishShortsWorkerLastTickAt ?? null;
}

/** 사진첩 lib/photos/worker.ts와 동일한 이유 — 별도 프로세스 없이 이 Next.js
 * 서버 프로세스 안에서 setInterval로 충분(장수 프로세스 전제). instrumentation.ts
 * 에서 1회만 등록된다(globalThis 재진입 가드로 hot-reload/중복 register() 방지). */
export function startEnglishShortsRenderWorker(): void {
  const g = globalThis as unknown as WorkerGlobal;
  if (g.__englishShortsRenderWorkerStarted) return;
  g.__englishShortsRenderWorkerStarted = true;

  setInterval(() => {
    g.__englishShortsWorkerLastTickAt = new Date().toISOString();
    processNextRenderJobs().catch(e => console.error('[english-shorts render worker]', e));
  }, POLL_INTERVAL_MS);
}
