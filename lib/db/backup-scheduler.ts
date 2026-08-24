import { getBackupConfig, runBackupNow, runFullAppBackup, listBackups } from './backup';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10분마다 체크

function isDue(kind: 'db' | 'full', intervalHours: number): boolean {
  const runs = listBackups().filter(r => r.kind === kind && r.triggeredBy === 'scheduled' && r.status === 'success');
  const lastRunAt = runs[0]?.createdAt ? new Date(runs[0].createdAt).getTime() : 0;
  return Date.now() >= lastRunAt + intervalHours * 60 * 60 * 1000;
}

async function runBackupIfDue() {
  const cfg = getBackupConfig();
  if (!cfg.enabled) return;

  if (isDue('db', cfg.intervalHours)) {
    try {
      const { filename } = await runBackupNow('scheduled');
      console.log(`[Backup] SQLite backup complete: ${filename}`);
    } catch (e) {
      console.error('[Backup] SQLite backup failed:', e);
    }
  }

  if (cfg.includeFullApp && isDue('full', cfg.intervalHours)) {
    try {
      const { filename } = await runFullAppBackup('scheduled');
      console.log(`[Backup] Full app backup complete: ${filename}`);
    } catch (e) {
      console.error('[Backup] Full app backup failed:', e);
    }
  }
}

export function startBackupScheduler() {
  void runBackupIfDue();
  setInterval(() => void runBackupIfDue(), CHECK_INTERVAL_MS);
}
