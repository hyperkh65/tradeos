import fs from 'fs';
import path from 'path';
import { getDb, getDbPath, closeDb, newId, now } from './sqlite';

export interface BackupConfig {
  enabled: boolean;
  intervalHours: number; // 백업 주기 (시간 단위)
  retainCount: number;   // 보관할 백업 개수
}

const DEFAULT_CONFIG: BackupConfig = { enabled: true, intervalHours: 24, retainCount: 10 };

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

function pruneOldBackups() {
  const cfg = getBackupConfig();
  const dir = getBackupDir();
  let files: string[];
  try { files = fs.readdirSync(dir); } catch { return; }
  const backups = files
    .filter(f => f.startsWith('nexport-') && f.endsWith('.db'))
    .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f } of backups.slice(Math.max(0, cfg.retainCount))) {
    try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
  }
}

export type BackupTrigger = 'scheduled' | 'manual' | 'pre_restore_safety';

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
    db.prepare(`INSERT INTO backup_runs (id, filename, size_bytes, triggered_by, status, error, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(id, filename, sizeBytes, triggeredBy, 'success', null, now());
    pruneOldBackups();
    return { filename, sizeBytes };
  } catch (e) {
    db.prepare(`INSERT INTO backup_runs (id, filename, size_bytes, triggered_by, status, error, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(id, filename, 0, triggeredBy, 'failed', String(e), now());
    throw e;
  }
}

export interface BackupListItem {
  id: string; filename: string; sizeBytes: number; triggeredBy: string; status: string; error: string | null; createdAt: string; existsOnDisk: boolean;
}

export function listBackups(): BackupListItem[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM backup_runs ORDER BY created_at DESC LIMIT 50`).all() as Record<string, unknown>[];
  const dir = getBackupDir();
  const known = new Set(rows.map(r => r.filename as string));
  const items: BackupListItem[] = rows.map(r => ({
    id: r.id as string,
    filename: r.filename as string,
    sizeBytes: (r.size_bytes as number) || 0,
    triggeredBy: r.triggered_by as string,
    status: r.status as string,
    error: (r.error as string) || null,
    createdAt: r.created_at as string,
    existsOnDisk: fs.existsSync(path.join(dir, r.filename as string)),
  }));

  // 이 기능이 생기기 전에 만들어진 백업 파일(이력 없음)도 목록에 함께 보여준다
  try {
    for (const f of fs.readdirSync(dir)) {
      if (known.has(f) || !f.endsWith('.db')) continue;
      const stat = fs.statSync(path.join(dir, f));
      items.push({
        id: f, filename: f, sizeBytes: stat.size, triggeredBy: 'unknown', status: 'success',
        error: null, createdAt: stat.mtime.toISOString(), existsOnDisk: true,
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
