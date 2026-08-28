import { processNextJobs } from './jobs';

const POLL_INTERVAL_MS = 10_000;

/** Next.js는 서버리스가 아니라 장수(long-lived) Node 프로세스로 운영되므로,
 * 별도 큐/Redis 없이 in-process setInterval로 충분하다. 인덱싱은 "설정 마법사"
 * 단계(관리자가 AI 도우미를 최종 켜기 전에 기존 자료를 먼저 인덱싱)에서도 동작해야
 * 하므로 admin의 AI_ENABLED 토글과는 별개로 동작하고, 서버 강제 차단(env AI_ENABLED=false)만 따른다.
 * instrumentation.ts에서 서버 시작 시 1회만 호출된다(중복 시작 방지 플래그 포함). */
export function startIndexWorker(): void {
  const g = globalThis as unknown as { __aiIndexWorkerStarted?: boolean };
  if (g.__aiIndexWorkerStarted) return;
  g.__aiIndexWorkerStarted = true;

  setInterval(() => {
    if (process.env.AI_ENABLED === 'false') return;
    processNextJobs(5).catch(() => { /* 개별 작업 실패는 이미 ai_index_jobs에 기록됨 — 워커 자체는 죽지 않아야 함 */ });
  }, POLL_INTERVAL_MS);
}
