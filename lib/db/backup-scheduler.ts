import fs from 'fs';
import path from 'path';
import { getDb } from './sqlite';

const BACKUP_DIR = process.env.SQLITE_BACKUP_DIR || '/volumeUSB1/usbshare/tradeos-backup';
const KEEP_DAYS = 14;
const BACKUP_HOUR = 3; // 새벽 3시
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 매시 정각 체크

let lastBackupDateKey = '';

async function runBackupIfDue() {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  if (now.getHours() !== BACKUP_HOUR || lastBackupDateKey === dateKey) return;
  lastBackupDateKey = dateKey;

  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = now.toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUP_DIR, `nexport-${ts}.db`);
    await getDb().backup(dest);

    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(BACKUP_DIR)) {
      if (!f.startsWith('nexport-') || !f.endsWith('.db')) continue;
      const full = path.join(BACKUP_DIR, f);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
    console.log(`[Backup] SQLite backup complete: ${dest}`);
  } catch (e) {
    console.error('[Backup] SQLite backup failed:', e);
  }
}

export function startBackupScheduler() {
  void runBackupIfDue();
  setInterval(() => void runBackupIfDue(), CHECK_INTERVAL_MS);
}
