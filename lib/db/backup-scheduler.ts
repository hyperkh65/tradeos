import { getBackupConfig, runBackupNow, listBackups } from './backup';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10분마다 체크

async function runBackupIfDue() {
  const cfg = getBackupConfig();
  if (!cfg.enabled) return;

  const runs = listBackups().filter(r => r.triggeredBy === 'scheduled' && r.status === 'success');
  const lastRunAt = runs[0]?.createdAt ? new Date(runs[0].createdAt).getTime() : 0;
  const dueAt = lastRunAt + cfg.intervalHours * 60 * 60 * 1000;
  if (Date.now() < dueAt) return;

  try {
    const { filename } = await runBackupNow('scheduled');
    console.log(`[Backup] SQLite backup complete: ${filename}`);
  } catch (e) {
    console.error('[Backup] SQLite backup failed:', e);
  }
}

export function startBackupScheduler() {
  void runBackupIfDue();
  setInterval(() => void runBackupIfDue(), CHECK_INTERVAL_MS);
}
