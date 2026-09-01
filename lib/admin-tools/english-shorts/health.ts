import fs from 'node:fs';
import { getDb } from '@/lib/db/sqlite';
import { resolveLocalPath } from '@/lib/storage/nas';
import { listActiveProvidersOrderedByPriority } from '@/lib/ai/db';
import { getFfmpegVersion, getFfprobeVersion, isFfmpegDockerConfigured } from './ffmpeg-exec';
import { getWorkerLastTickAt } from './worker';
import { uploadEnglishShortsFile, downloadEnglishShortsFile, deleteEnglishShortsFile, ENGLISH_SHORTS_ROOT } from './storage';

export type HealthStatus = 'ok' | 'warning' | 'error';

export interface HealthCheckItem {
  name: string;
  status: HealthStatus;
  detail: string;
}

export interface EnglishShortsHealth {
  overallStatus: HealthStatus;
  checkedAt: string;
  items: HealthCheckItem[];
}

function worst(a: HealthStatus, b: HealthStatus): HealthStatus {
  const rank: Record<HealthStatus, number> = { ok: 0, warning: 1, error: 2 };
  return rank[b] > rank[a] ? b : a;
}

async function checkDatabase(): Promise<HealthCheckItem> {
  try {
    const db = getDb();
    const row = db.prepare('SELECT 1 as ok').get() as { ok: number };
    return row.ok === 1
      ? { name: 'Database', status: 'ok', detail: 'SELECT 1 성공' }
      : { name: 'Database', status: 'error', detail: 'SELECT 1이 예상과 다른 값을 반환함' };
  } catch (e) {
    return { name: 'Database', status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** NAS 왕복 쓰기 테스트 — 실제로 작은 파일을 써서 다시 읽어 바이트가 일치하는지
 * 확인한다(단순 존재 여부 체크가 아니라 실제 왕복 검증, 끝나면 반드시 삭제). */
async function checkNasRoundTrip(): Promise<HealthCheckItem> {
  const testPath = `${ENGLISH_SHORTS_ROOT}/health-check/ping-${Date.now()}.txt`;
  const payload = Buffer.from(`health-check-${Date.now()}`);
  try {
    const upload = await uploadEnglishShortsFile(testPath, payload, 'text/plain');
    if (!upload.success || !upload.path) {
      return { name: 'NAS Storage', status: 'error', detail: `쓰기 실패: ${upload.error ?? '알 수 없는 오류'}` };
    }
    const downloaded = await downloadEnglishShortsFile(upload.path);
    await deleteEnglishShortsFile(upload.path);
    if (!downloaded || !downloaded.equals(payload)) {
      return { name: 'NAS Storage', status: 'error', detail: '왕복 검증 실패 — 쓴 내용과 읽은 내용이 다름' };
    }
    return { name: 'NAS Storage', status: 'ok', detail: `쓰기/읽기/삭제 왕복 성공 (${upload.path})` };
  } catch (e) {
    return { name: 'NAS Storage', status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

async function checkFfmpeg(): Promise<HealthCheckItem> {
  const dockerConfigured = isFfmpegDockerConfigured();
  try {
    const [ffmpegVersion, ffprobeVersion] = await Promise.all([getFfmpegVersion(), getFfprobeVersion()]);
    if (!ffmpegVersion || !ffprobeVersion) {
      return { name: 'FFmpeg', status: 'error', detail: 'ffmpeg/ffprobe 버전을 가져오지 못했습니다(컨테이너 또는 바이너리 확인 필요)' };
    }
    const mode = dockerConfigured ? 'Docker(tradeos-ffmpeg)' : '로컬 바이너리(개발 환경 폴백)';
    return { name: 'FFmpeg', status: dockerConfigured ? 'ok' : 'warning', detail: `${mode} — ${ffmpegVersion} / ${ffprobeVersion}` };
  } catch (e) {
    return { name: 'FFmpeg', status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

function checkAiProvider(): HealthCheckItem {
  try {
    const providers = listActiveProvidersOrderedByPriority().filter(p => p.supportsChat);
    if (providers.length === 0) {
      return { name: 'AI Provider', status: 'error', detail: '표현 분석에 쓸 수 있는 활성화된 채팅 Provider가 없습니다' };
    }
    const healthy = providers.filter(p => p.status === 'healthy');
    if (healthy.length === 0) {
      return { name: 'AI Provider', status: 'warning', detail: `${providers.length}개 등록되어 있으나 healthy 상태인 Provider가 없습니다(최근 실패: ${providers[0].lastError ?? '기록 없음'})` };
    }
    return { name: 'AI Provider', status: 'ok', detail: `${healthy.length}/${providers.length}개 정상 (1순위: ${healthy[0].name})` };
  } catch (e) {
    return { name: 'AI Provider', status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

function checkWorkerHeartbeat(): HealthCheckItem {
  const lastTick = getWorkerLastTickAt();
  if (!lastTick) return { name: 'Worker', status: 'warning', detail: '아직 한 번도 tick이 기록되지 않았습니다(서버가 막 시작했을 수 있음)' };
  const ageMs = Date.now() - new Date(lastTick).getTime();
  if (ageMs > 60_000) return { name: 'Worker', status: 'error', detail: `마지막 tick이 ${Math.round(ageMs / 1000)}초 전(정상이라면 10초 간격이어야 함)` };
  return { name: 'Worker', status: 'ok', detail: `마지막 tick ${Math.round(ageMs / 1000)}초 전` };
}

function checkQueueDepth(): HealthCheckItem {
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT status, COUNT(*) as c FROM media_render_jobs GROUP BY status`).all() as { status: string; c: number }[];
    const byStatus = Object.fromEntries(rows.map(r => [r.status, r.c]));
    const queued = byStatus.queued ?? 0;
    const processing = byStatus.processing ?? 0;
    const detail = `대기 ${queued} / 처리중 ${processing} / 완료 ${byStatus.completed ?? 0} / 실패 ${byStatus.failed ?? 0} / 취소 ${byStatus.cancelled ?? 0}`;
    return { name: 'Render Queue', status: queued > 20 ? 'warning' : 'ok', detail };
  } catch (e) {
    return { name: 'Render Queue', status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

function checkDiskSpace(): HealthCheckItem {
  const root = resolveLocalPath(ENGLISH_SHORTS_ROOT);
  if (!root) return { name: 'Disk', status: 'warning', detail: 'WebDAV 저장소 설정에서는 로컬 디스크 여유공간을 측정할 수 없습니다' };
  try {
    fs.mkdirSync(root, { recursive: true });
    const statfs = (fs as unknown as { statfsSync?: (p: string) => { bavail: number; bsize: number; blocks: number } }).statfsSync;
    if (!statfs) return { name: 'Disk', status: 'warning', detail: 'Node 버전이 statfsSync를 지원하지 않습니다' };
    const st = statfs(root);
    const freeBytes = st.bavail * st.bsize;
    const totalBytes = st.blocks * st.bsize;
    const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;
    const freeGb = (freeBytes / 1024 ** 3).toFixed(1);
    const totalGb = (totalBytes / 1024 ** 3).toFixed(1);
    return {
      name: 'Disk', status: freePercent < 5 ? 'error' : freePercent < 15 ? 'warning' : 'ok',
      detail: `${freeGb}GB / ${totalGb}GB 여유(${freePercent.toFixed(1)}%)`,
    };
  } catch (e) {
    return { name: 'Disk', status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** 전부 실측값 — 하드코딩된 boolean 없음(요청서 명시 요구사항). */
export async function getEnglishShortsHealth(): Promise<EnglishShortsHealth> {
  const [db, nas, ffmpeg] = await Promise.all([checkDatabase(), checkNasRoundTrip(), checkFfmpeg()]);
  const items: HealthCheckItem[] = [db, nas, ffmpeg, checkAiProvider(), checkWorkerHeartbeat(), checkQueueDepth(), checkDiskSpace()];
  const overallStatus = items.reduce<HealthStatus>((acc, item) => worst(acc, item.status), 'ok');
  return { overallStatus, checkedAt: new Date().toISOString(), items };
}
