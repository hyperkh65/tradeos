import { getDb } from '@/lib/db/sqlite';
import { createNotification } from '@/lib/notifications';
import { logSystemChange, listSystemChanges } from '@/lib/backup/change-log';

/**
 * 새 서버로 복원된 직후 체크(요청서 Phase15) — recovery/restore.sh가 .env.recovered에
 * 남기는 RECOVERY_RESTORED_AT을 읽는다. 사진첩 외부 공유 링크는 옛 환경 기준으로 이미
 * 배포됐을 수 있어(QR/링크를 받은 외부인이 새 환경에서도 계속 접근 가능한 게 맞는지는
 * 시스템이 자동 판단할 수 없다), 활성 링크가 있으면 관리자에게 재검토를 요청한다.
 * 서버가 여러 번 재기동돼도 같은 RECOVERY_RESTORED_AT에 대해 한 번만 알린다
 * (system_change_log에 마커를 남겨 dedupe).
 */
export async function checkAndNotifyPostRestoreExternalShares(): Promise<void> {
  const restoredAt = process.env.RECOVERY_RESTORED_AT;
  if (!restoredAt) return;

  const marker = `RECOVERY_RESTORED_AT=${restoredAt}`;
  const already = listSystemChanges(500).some(c => c.category === 'photo-recovery-review' && c.details === marker);
  if (already) return;

  const db = getDb();
  const activeShares = db.prepare(`SELECT COUNT(*) as n FROM photo_shares WHERE status='active'`).get() as { n: number };

  logSystemChange({
    category: 'photo-recovery-review',
    summary: `백업 복원 후 사진첩 외부 공유 링크 재검토 체크 실행(활성 링크 ${activeShares.n}건)`,
    details: marker,
    createdBy: 'system-restore-check',
  });

  if (activeShares.n === 0) return;

  const admins = db.prepare(`SELECT id FROM users WHERE role='admin'`).all() as { id: string }[];
  if (admins.length === 0) return;

  await createNotification({
    userIds: admins.map(a => a.id),
    type: 'photo_recovery_review',
    title: '백업 복원됨 — 사진첩 외부 공유 링크 재검토 필요',
    body: `이 서버는 백업에서 복원되었습니다. 현재 활성 상태인 외부 공유 링크가 ${activeShares.n}건 있습니다 — 옛 환경에서 발급된 링크이므로 계속 유효하게 둘지, 폐기하고 새로 발급할지 검토하세요.`,
    link: '/settings/photo-shares',
  });
}
