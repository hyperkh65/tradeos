import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDb, getDbPath, closeDb, newId, now } from './sqlite';

const execFileAsync = promisify(execFile);

export interface BackupConfig {
  enabled: boolean;
  intervalHours: number;  // 백업 주기 (시간 단위) — 기존 DB/전체tar 백업용, 그대로 유지
  retainCount: number;    // DB 백업 보관 개수
  includeFullApp: boolean; // 예약 백업 때 프로그램 전체(실행 파일 전부)도 함께 백업할지
  fullAppRetainCount: number; // 전체 백업은 용량이 크므로 별도 보관 개수
  // Complete Recovery Package(재해복구 패키지) 전용 스케줄 — "N일마다 HH:MM" 방식
  completePackageEnabled: boolean;
  scheduleDayInterval: number; // 며칠마다
  scheduleHour: number;        // 0~23
  scheduleMinute: number;      // 0~59
  completePackageRetainCount: number;       // 최근 N개 보존
  completePackageMonthlyArchiveCount: number; // 그 밖에 월간 아카이브로 별도 보존할 개수
}

const DEFAULT_CONFIG: BackupConfig = {
  enabled: true, intervalHours: 24, retainCount: 10,
  includeFullApp: true, fullAppRetainCount: 5,
  completePackageEnabled: true, scheduleDayInterval: 3, scheduleHour: 3, scheduleMinute: 0,
  completePackageRetainCount: 5, completePackageMonthlyArchiveCount: 3,
};

function ensureSettingsTable(db: ReturnType<typeof getDb>) {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
}

export function getBackupDir(): string {
  return process.env.SQLITE_BACKUP_DIR || (process.env.NODE_ENV === 'production'
    ? '/volumeUSB1/usbshare/tradeos-backup'
    : path.join(process.cwd(), 'data', 'backups'));
}

// 프로그램 전체 백업 시 통째로 압축할 배포 루트 (standalone 서버 + 정적 파일 + 업로드/DB 전부 포함)
export function getAppRootDir(): string {
  return process.env.APP_ROOT_DIR || (process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos'
    : process.cwd());
}

export function getBackupConfig(): BackupConfig {
  try {
    const db = getDb();
    ensureSettingsTable(db);
    const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get('backup_config') as { value: string } | undefined;
    if (!row) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveBackupConfig(cfg: Partial<BackupConfig>): BackupConfig {
  const db = getDb();
  ensureSettingsTable(db);
  const merged = { ...getBackupConfig(), ...cfg };
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?,?,?)')
    .run('backup_config', JSON.stringify(merged), now());
  return merged;
}

function pruneOldBackups(prefix: string, retainCount: number) {
  const dir = getBackupDir();
  let files: string[];
  try { files = fs.readdirSync(dir); } catch { return; }
  const backups = files
    .filter(f => f.startsWith(prefix))
    .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f } of backups.slice(Math.max(0, retainCount))) {
    try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
  }
}

export type BackupTrigger = 'scheduled' | 'manual' | 'pre_restore_safety';
export type BackupKind = 'db' | 'full';

export async function runBackupNow(triggeredBy: BackupTrigger): Promise<{ filename: string; sizeBytes: number }> {
  const dir = getBackupDir();
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `nexport-${ts}.db`;
  const dest = path.join(dir, filename);
  const db = getDb();
  const id = newId();

  try {
    await db.backup(dest);
    const sizeBytes = fs.statSync(dest).size;
    db.prepare(`INSERT INTO backup_runs (id, filename, size_bytes, triggered_by, status, error, kind, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, filename, sizeBytes, triggeredBy, 'success', null, 'db', now());
    pruneOldBackups('nexport-', getBackupConfig().retainCount);
    return { filename, sizeBytes };
  } catch (e) {
    db.prepare(`INSERT INTO backup_runs (id, filename, size_bytes, triggered_by, status, error, kind, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, filename, 0, triggeredBy, 'failed', String(e), 'db', now());
    throw e;
  }
}

// 프로그램 전체(실행 파일 + 정적 자산 + 업로드 + DB) 백업 — 나스가 통째로 사라져도
// 다른 나스에 이 압축을 풀기만 하면(+GitHub Secrets의 환경변수로 재기동) 바로 복구되도록.
export async function runFullAppBackup(triggeredBy: BackupTrigger): Promise<{ filename: string; sizeBytes: number }> {
  const dir = getBackupDir();
  fs.mkdirSync(dir, { recursive: true });
  const appRoot = getAppRootDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `full-${ts}.tar.gz`;
  const dest = path.join(dir, filename);
  const db = getDb();
  const id = newId();

  // 백업 폴더가 개발 환경처럼 앱 루트 안(data/backups)에 있을 경우 자기 자신을 담지 않도록 제외
  const targets = ['.next/standalone', '.next/static', 'public', 'data']
    .filter(t => fs.existsSync(path.join(appRoot, t)));

  try {
    if (targets.length === 0) throw new Error('백업할 대상 폴더를 찾을 수 없습니다 (배포 경로 확인 필요)');
    await execFileAsync('tar', ['-czf', dest, '-C', appRoot, '--exclude=data/backups', ...targets], { maxBuffer: 1024 * 1024 * 50 });
    const sizeBytes = fs.statSync(dest).size;
    db.prepare(`INSERT INTO backup_runs (id, filename, size_bytes, triggered_by, status, error, kind, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, filename, sizeBytes, triggeredBy, 'success', null, 'full', now());
    pruneOldBackups('full-', getBackupConfig().fullAppRetainCount);
    return { filename, sizeBytes };
  } catch (e) {
    db.prepare(`INSERT INTO backup_runs (id, filename, size_bytes, triggered_by, status, error, kind, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, filename, 0, triggeredBy, 'failed', String(e), 'full', now());
    throw e;
  }
}

export interface BackupListItem {
  id: string; filename: string; sizeBytes: number; triggeredBy: string; status: string; error: string | null; kind: BackupKind; createdAt: string; existsOnDisk: boolean;
}

export function listBackups(): BackupListItem[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM backup_runs ORDER BY created_at DESC LIMIT 80`).all() as Record<string, unknown>[];
  const dir = getBackupDir();
  const known = new Set(rows.map(r => r.filename as string));
  const items: BackupListItem[] = rows.map(r => ({
    id: r.id as string,
    filename: r.filename as string,
    sizeBytes: (r.size_bytes as number) || 0,
    triggeredBy: r.triggered_by as string,
    status: r.status as string,
    error: (r.error as string) || null,
    kind: ((r.kind as string) || 'db') as BackupKind,
    createdAt: r.created_at as string,
    existsOnDisk: fs.existsSync(path.join(dir, r.filename as string)),
  }));

  // 이 기능이 생기기 전에 만들어진 백업 파일(이력 없음)도 목록에 함께 보여준다
  try {
    for (const f of fs.readdirSync(dir)) {
      if (known.has(f) || (!f.endsWith('.db') && !f.endsWith('.tar.gz'))) continue;
      const stat = fs.statSync(path.join(dir, f));
      items.push({
        id: f, filename: f, sizeBytes: stat.size, triggeredBy: 'unknown',
        status: 'success', error: null, kind: f.endsWith('.tar.gz') ? 'full' : 'db',
        createdAt: stat.mtime.toISOString(), existsOnDisk: true,
      });
    }
  } catch { /* backup dir may not exist yet */ }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreBackup(filename: string): Promise<void> {
  const dir = getBackupDir();
  const safeName = path.basename(filename); // 경로 조작 방지
  const src = path.join(dir, safeName);
  if (!fs.existsSync(src)) throw new Error('백업 파일을 찾을 수 없습니다.');
  if (!safeName.endsWith('.db')) throw new Error('DB 백업 파일만 이 화면에서 복원할 수 있습니다. 전체 백업은 파일을 내려받아 나스에 직접 복원해야 합니다.');

  // 복원 전 현재 상태를 되돌릴 수 있도록 안전 스냅샷을 먼저 남긴다
  await runBackupNow('pre_restore_safety');

  const dbPath = getDbPath();
  closeDb();
  for (const ext of ['-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + ext); } catch { /* ignore */ }
  }
  fs.copyFileSync(src, dbPath);
  // 다음 getDb() 호출에서 새 파일로 자동 재연결된다
}
