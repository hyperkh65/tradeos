export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startBackupScheduler } = await import('@/lib/db/backup-scheduler');
  startBackupScheduler();
  const { startIndexWorker } = await import('@/lib/ai/worker');
  startIndexWorker();
}
