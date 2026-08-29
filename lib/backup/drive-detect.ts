import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getDb, now } from '../db/sqlite';

export interface DetectedDrive {
  device: string;
  mountPoint: string;
  fsType: string;
  uuid: string | null;
  sizeBytes: number | null;
  freeBytes: number | null;
}

/** Synology는 외장 USB 드라이브를 `/volumeUSB1`, `/volumeUSB2` ... 아래 마운트한다.
 * mount path만 믿으면(재부팅 후 순번이 바뀌거나, 다른 USB가 꽂혀 있으면) 엉뚱한
 * 드라이브에 백업할 위험이 있어 가능하면 안정적인 UUID까지 확보한다. macOS 개발
 * 환경 등 `/proc/mounts`가 없는 곳에서는 빈 배열을 반환한다(안전하게 무시). */
export function detectExternalDrives(): DetectedDrive[] {
  let mounts: string;
  try { mounts = fs.readFileSync('/proc/mounts', 'utf8'); } catch { return []; }

  const drives: DetectedDrive[] = [];
  for (const line of mounts.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [device, mountPoint, fsType] = parts;
    if (!/^\/volumeUSB/.test(mountPoint)) continue;

    let uuid: string | null = null;
    try {
      const byUuidDir = '/dev/disk/by-uuid';
      for (const name of fs.readdirSync(byUuidDir)) {
        const link = fs.readlinkSync(path.join(byUuidDir, name));
        if (path.basename(link) === path.basename(device)) { uuid = name; break; }
      }
    } catch { /* by-uuid 심볼릭 링크 디렉터리가 없는 환경 — uuid 없이 진행 */ }

    let sizeBytes: number | null = null;
    let freeBytes: number | null = null;
    try {
      const dfOut = execFileSync('df', ['-k', mountPoint], { timeout: 3000 }).toString();
      const dfLine = dfOut.trim().split('\n').slice(-1)[0];
      const cols = dfLine.trim().split(/\s+/);
      sizeBytes = parseInt(cols[1], 10) * 1024;
      freeBytes = parseInt(cols[3], 10) * 1024;
    } catch { /* ignore */ }

    drives.push({ device, mountPoint, fsType, uuid, sizeBytes, freeBytes });
  }
  return drives;
}

function ensureSettingsTable() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
}

const SELECTED_DRIVE_KEY = 'backup_selected_drive_uuid';

export function setSelectedBackupDriveUuid(uuid: string): void {
  ensureSettingsTable();
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?,?,?)').run(SELECTED_DRIVE_KEY, uuid, now());
}

export function getSelectedBackupDriveUuid(): string | null {
  ensureSettingsTable();
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(SELECTED_DRIVE_KEY) as { value: string } | undefined;
  return row?.value ?? null;
}

/** 관리자가 선택한 UUID의 드라이브가 "지금" 어느 mount path에 있는지 확인한다 —
 * 선택된 UUID가 감지되지 않으면(뽑혀 있거나 고장) null을 반환해서 호출자가
 * "잘못된/없는 드라이브에 백업"하지 않고 명확히 실패하게 한다. */
export function resolveSelectedBackupDriveMountPoint(): string | null {
  const uuid = getSelectedBackupDriveUuid();
  if (!uuid) return null;
  const drives = detectExternalDrives();
  return drives.find(d => d.uuid === uuid)?.mountPoint ?? null;
}
