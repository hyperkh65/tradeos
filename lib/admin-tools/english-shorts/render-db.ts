import { getDb, newId, now } from '@/lib/db/sqlite';
import { getEnglishShortsSettings } from './settings';

export type RenderJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface RenderJobRow {
  id: string;
  projectId: string;
  status: RenderJobStatus;
  stage: string | null;
  progress: number;
  attempts: number;
  lastError: string | null;
  outputVideoPath: string | null;
  outputThumbnailPath: string | null;
  outputDurationSec: number | null;
  outputFileSize: number | null;
  cancelRequested: boolean;
  requestedBy: string | null;
  requestedByName: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

function rowToJob(r: Record<string, unknown>): RenderJobRow {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    status: r.status as RenderJobStatus,
    stage: r.stage as string | null,
    progress: r.progress as number,
    attempts: r.attempts as number,
    lastError: r.last_error as string | null,
    outputVideoPath: r.output_video_path as string | null,
    outputThumbnailPath: r.output_thumbnail_path as string | null,
    outputDurationSec: r.output_duration_sec as number | null,
    outputFileSize: r.output_file_size as number | null,
    cancelRequested: !!r.cancel_requested,
    requestedBy: r.requested_by as string | null,
    requestedByName: r.requested_by_name as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    startedAt: r.started_at as string | null,
    completedAt: r.completed_at as string | null,
  };
}

export function enqueueRenderJob(projectId: string, requestedBy: string, requestedByName: string): RenderJobRow {
  const db = getDb();
  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO media_render_jobs
    (id, project_id, status, stage, progress, attempts, cancel_requested, requested_by, requested_by_name, created_at, updated_at)
    VALUES (?,?,'queued',NULL,0,0,0,?,?,?,?)`)
    .run(id, projectId, requestedBy, requestedByName, ts, ts);
  return getRenderJobById(id)!;
}

export function getRenderJobById(id: string): RenderJobRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM media_render_jobs WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export function listRenderJobsForProject(projectId: string): RenderJobRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM media_render_jobs WHERE project_id=? ORDER BY created_at DESC`).all(projectId) as Record<string, unknown>[];
  return rows.map(rowToJob);
}

/**
 * 동시 렌더 제한 — es_settings.max_render_concurrency를 하나의 DB 트랜잭션
 * 안에서 확인해 남은 슬롯만큼만 claim한다(UI 안내로 끝내지 않고 DB 자체가
 * 동시성의 단일 진실 소스, 요청서 명시 요구사항). 사진첩 claimNextPhotoJobs와
 * 달리 배치 크기를 호출자가 넘기지 않고 여기서 슬롯 계산까지 전부 담당한다.
 */
export function claimNextRenderJobs(): RenderJobRow[] {
  const db = getDb();
  const settings = getEnglishShortsSettings();
  const ts = now();
  let claimed: RenderJobRow[] = [];
  const tx = db.transaction(() => {
    const { c: processingCount } = db.prepare(`SELECT COUNT(*) c FROM media_render_jobs WHERE status='processing'`).get() as { c: number };
    const slots = Math.max(0, settings.maxRenderConcurrency - processingCount);
    if (slots === 0) return;
    const rows = db.prepare(`SELECT * FROM media_render_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT ?`).all(slots) as Record<string, unknown>[];
    if (rows.length === 0) return;
    const mark = db.prepare(`UPDATE media_render_jobs SET status='processing', started_at=?, updated_at=? WHERE id=?`);
    for (const r of rows) mark.run(ts, ts, r.id as string);
    claimed = rows.map(r => ({ ...rowToJob(r), status: 'processing' as const, startedAt: ts, updatedAt: ts }));
  });
  tx();
  return claimed;
}

export function updateRenderJobProgress(id: string, stage: string, progress: number): void {
  const db = getDb();
  db.prepare(`UPDATE media_render_jobs SET stage=?, progress=?, updated_at=? WHERE id=?`).run(stage, progress, now(), id);
}

export interface CompleteRenderJobInput {
  outputVideoPath: string;
  outputThumbnailPath: string;
  outputDurationSec: number;
  outputFileSize: number;
}

export function completeRenderJob(id: string, result: CompleteRenderJobInput): void {
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE media_render_jobs SET status='completed', stage='done', progress=100,
    output_video_path=?, output_thumbnail_path=?, output_duration_sec=?, output_file_size=?,
    completed_at=?, updated_at=? WHERE id=?`)
    .run(result.outputVideoPath, result.outputThumbnailPath, result.outputDurationSec, result.outputFileSize, ts, ts, id);
}

/** 반환값: 재시도 소진으로 최종 'failed' 확정이면 true, 아직 재시도 대상('queued')이면 false. */
export function failRenderJob(id: string, message: string): boolean {
  const db = getDb();
  const settings = getEnglishShortsSettings();
  const ts = now();
  const row = db.prepare(`SELECT attempts FROM media_render_jobs WHERE id=?`).get(id) as { attempts: number } | undefined;
  const attempts = (row?.attempts || 0) + 1;
  const finalFailed = attempts >= settings.renderMaxAttempts;
  const status: RenderJobStatus = finalFailed ? 'failed' : 'queued';
  db.prepare(`UPDATE media_render_jobs SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?`)
    .run(status, attempts, message, ts, id);
  return finalFailed;
}

/** 취소 요청 플래그만 세운다 — 실제 진행 중 작업 중단은 워커(Phase 13)가
 * 단계 경계마다 이 플래그를 확인해서 처리한다(즉시 kill 아님, 안전한 지점에서 중단). */
export function requestCancelRenderJob(id: string): boolean {
  const db = getDb();
  const res = db.prepare(`UPDATE media_render_jobs SET cancel_requested=1, updated_at=? WHERE id=? AND status IN ('queued','processing')`)
    .run(now(), id);
  return res.changes > 0;
}

export function markRenderJobCancelled(id: string): void {
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE media_render_jobs SET status='cancelled', updated_at=?, completed_at=? WHERE id=?`).run(ts, ts, id);
}

/** 서버 재시작 등으로 processing에 멈춘 잡을 회수(사진첩 recoverStalePhotoJobs와
 * 동일 원리, stale 기준 시간은 es_settings.render_stale_processing_minutes로 설정 가능). */
export function recoverStaleRenderJobs(): number {
  const db = getDb();
  const settings = getEnglishShortsSettings();
  const cutoff = new Date(Date.now() - settings.renderStaleProcessingMinutes * 60_000).toISOString();
  const stale = db.prepare(`SELECT id, attempts FROM media_render_jobs WHERE status='processing' AND updated_at < ?`).all(cutoff) as { id: string; attempts: number }[];
  if (stale.length === 0) return 0;
  const ts = now();
  const tx = db.transaction(() => {
    for (const row of stale) {
      const attempts = row.attempts + 1;
      const status: RenderJobStatus = attempts >= settings.renderMaxAttempts ? 'failed' : 'queued';
      db.prepare(`UPDATE media_render_jobs SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?`)
        .run(status, attempts, '워커 프로세스 재시작 등으로 처리가 중단되어 자동 회수됨', ts, row.id);
    }
  });
  tx();
  return stale.length;
}

export function insertRenderLog(jobId: string, level: 'info' | 'warn' | 'error', message: string): void {
  const db = getDb();
  db.prepare(`INSERT INTO es_render_logs (id, job_id, level, message, created_at) VALUES (?,?,?,?,?)`)
    .run(newId(), jobId, level, message, now());
}

export function listRenderLogs(jobId: string): { level: string; message: string; createdAt: string }[] {
  const db = getDb();
  const rows = db.prepare(`SELECT level, message, created_at FROM es_render_logs WHERE job_id=? ORDER BY created_at ASC`).all(jobId) as Record<string, unknown>[];
  return rows.map(r => ({ level: r.level as string, message: r.message as string, createdAt: r.created_at as string }));
}
