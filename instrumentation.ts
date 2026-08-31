export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startBackupScheduler } = await import('@/lib/db/backup-scheduler');
  startBackupScheduler();
  const { startIndexWorker } = await import('@/lib/ai/worker');
  startIndexWorker();
  const { startPhotoThumbnailWorker } = await import('@/lib/photos/worker');
  startPhotoThumbnailWorker();
  const { seedInitialChangeHistory, logSystemChange } = await import('@/lib/backup/change-log');
  seedInitialChangeHistory();
  const { migrateLegacyProviderDefaults } = await import('@/lib/ai/db');
  const migratedCount = migrateLegacyProviderDefaults();
  if (migratedCount > 0) {
    logSystemChange({
      category: 'ai',
      summary: `옛 모델(llama-3.3-70b/bge-base-en-v1.5)로 저장돼 있던 Provider ${migratedCount}개를 GLM-4.7-Flash/bge-m3로 자동 갱신`,
      details: '2026-08-28 모델 교체 이전에 생성된 Provider 행이 새 기본값으로 소급 갱신되지 않고 남아있던 것을 서버 시작 시 자동으로 바로잡음',
    });
  }
}
