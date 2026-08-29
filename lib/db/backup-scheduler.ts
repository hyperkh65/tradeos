import { getBackupConfig, runBackupNow, runFullAppBackup, listBackups } from './backup';

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10분마다 체크

function isDue(kind: 'db' | 'full', intervalHours: number): boolean {
  const runs = listBackups().filter(r => r.kind === kind && r.triggeredBy === 'scheduled' && r.status === 'success');
  const lastRunAt = runs[0]?.createdAt ? new Date(runs[0].createdAt).getTime() : 0;
  return Date.now() >= lastRunAt + intervalHours * 60 * 60 * 1000;
}

/** Complete Recovery Package 전용 — "N일마다 HH:MM". 폴링 주기가 10분이라 정확히
 * 그 분에 안 걸려도(서버 재시작 등으로 놓쳐도) "오늘 예정 시각이 지났고 + 마지막
 * 실행 이후 며칠이 지났는지"로 판단하므로 늦게라도 반드시 실행된다. */
function isDueForCompletePackage(lastSuccessAt: number | null, dayInterval: number, hour: number, minute: number): boolean {
  const nowDate = new Date();
  const todayScheduled = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), hour, minute, 0, 0);
  if (nowDate < todayScheduled) return false;
  if (!lastSuccessAt) return true;
  const daysSinceLastRun = Math.floor((nowDate.getTime() - lastSuccessAt) / (24 * 60 * 60 * 1000));
  return daysSinceLastRun >= dayInterval;
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

  if (cfg.completePackageEnabled) {
    try {
      const { listCompleteRecoveryPackages, createCompleteRecoveryPackage, pruneCompletePackages } = await import('../backup/package');
      const successRuns = listCompleteRecoveryPackages().filter(p => p.triggeredBy === 'scheduled' && (p.status === 'SUCCESS' || p.status === 'WARNING'));
      const lastSuccessAt = successRuns[0]?.createdAt ? new Date(successRuns[0].createdAt).getTime() : null;
      if (isDueForCompletePackage(lastSuccessAt, cfg.scheduleDayInterval, cfg.scheduleHour, cfg.scheduleMinute)) {
        const result = await createCompleteRecoveryPackage('scheduled');
        console.log(`[Backup] Complete Recovery Package ${result.status}: ${result.filename}`);
        pruneCompletePackages(cfg.completePackageRetainCount, cfg.completePackageMonthlyArchiveCount);
      }
    } catch (e) {
      console.error('[Backup] Complete Recovery Package failed:', e);
    }
  }
}

export function startBackupScheduler() {
  void runBackupIfDue();
  setInterval(() => void runBackupIfDue(), CHECK_INTERVAL_MS);
}
