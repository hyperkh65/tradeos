import { getDb, newId, now } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { getFolderById } from '@/lib/photos/folders';
import { canEditOwned, canManageExternalShare } from '@/lib/photos/permissions';
import { writePhotoAuditLog } from '@/lib/photos/audit';

export type ShareTargetType = 'folder' | 'album' | 'photo';
export type SharePermissionLevel = 'view' | 'download' | 'upload' | 'edit' | 'share' | 'delete';

const LEVEL_ORDER: SharePermissionLevel[] = ['view', 'download', 'upload', 'edit', 'share', 'delete'];

export type ShareResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export interface InternalShareRow {
  id: string; targetType: ShareTargetType; targetId: string; sharedWithUserId: string; sharedWithUserName: string;
  permissionLevel: SharePermissionLevel; createdByName: string; createdAt: string;
}

/** 요청서 38번: 폴더/앨범/사진 단위 사내 공유. 권한레벨은 순서가 있는 단일 값(포함관계 아님) —
 * 예를 들어 'edit'을 받으면 'view'/'download' 권한도 당연히 포함한다고 간주(minLevel 비교). */
export function hasInternalShareAccess(userId: string, targetType: ShareTargetType, targetId: string, minLevel: SharePermissionLevel = 'view'): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT permission_level FROM photo_internal_shares WHERE target_type=? AND target_id=? AND shared_with_user_id=?`)
    .get(targetType, targetId, userId) as { permission_level: string } | undefined;
  if (!row) return false;
  const have = LEVEL_ORDER.indexOf(row.permission_level as SharePermissionLevel);
  const need = LEVEL_ORDER.indexOf(minLevel);
  return have >= 0 && have >= need;
}

function canManageSharesFor(user: User, targetType: ShareTargetType, targetId: string): boolean {
  if (targetType === 'folder') {
    const folder = getFolderById(targetId);
    if (!folder) return false;
    return canEditOwned(user, folder.ownerUserId) || hasInternalShareAccess(user.id, 'folder', targetId, 'share');
  }
  // album/photo는 canManageExternalShare과 동일하게 소유자/관리자 기준(단순화).
  return canManageExternalShare(user, null);
}

export function createInternalShare(user: User, targetType: ShareTargetType, targetId: string, sharedWithUserId: string, permissionLevel: SharePermissionLevel): ShareResult<InternalShareRow> {
  if (!canManageSharesFor(user, targetType, targetId) && user.role !== 'admin') {
    return { ok: false, error: '권한이 없습니다', status: 403 };
  }
  const db = getDb();
  const targetUser = db.prepare(`SELECT id, name FROM users WHERE id=?`).get(sharedWithUserId) as { id: string; name: string } | undefined;
  if (!targetUser) return { ok: false, error: '대상 사용자를 찾을 수 없습니다', status: 400 };

  const existing = db.prepare(`SELECT id FROM photo_internal_shares WHERE target_type=? AND target_id=? AND shared_with_user_id=?`)
    .get(targetType, targetId, sharedWithUserId) as { id: string } | undefined;
  const id = existing?.id ?? newId();
  if (existing) {
    db.prepare(`UPDATE photo_internal_shares SET permission_level=? WHERE id=?`).run(permissionLevel, id);
  } else {
    db.prepare(`INSERT INTO photo_internal_shares (id, target_type, target_id, shared_with_user_id, permission_level, created_by, created_by_name, created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(id, targetType, targetId, sharedWithUserId, permissionLevel, user.id, user.name, now());
  }
  writePhotoAuditLog({ userId: user.id, userName: user.name, action: 'SHARE_CREATED', after: { targetType, targetId, sharedWithUserId, permissionLevel } });
  return { ok: true, data: { id, targetType, targetId, sharedWithUserId, sharedWithUserName: targetUser.name, permissionLevel, createdByName: user.name, createdAt: now() } };
}

export function revokeInternalShare(user: User, shareId: string): ShareResult<null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photo_internal_shares WHERE id=?`).get(shareId) as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: 'not found', status: 404 };
  if (!canManageSharesFor(user, row.target_type as ShareTargetType, row.target_id as string) && user.role !== 'admin') {
    return { ok: false, error: '권한이 없습니다', status: 403 };
  }
  db.prepare(`DELETE FROM photo_internal_shares WHERE id=?`).run(shareId);
  writePhotoAuditLog({ userId: user.id, userName: user.name, action: 'SHARE_REVOKED', before: { targetType: row.target_type, targetId: row.target_id } });
  return { ok: true, data: null };
}

export function listSharesForTarget(targetType: ShareTargetType, targetId: string): InternalShareRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.*, u.name as user_name FROM photo_internal_shares s
    JOIN users u ON u.id = s.shared_with_user_id
    WHERE s.target_type=? AND s.target_id=? ORDER BY s.created_at DESC
  `).all(targetType, targetId) as Record<string, unknown>[];
  return rows.map(r => ({
    id: r.id as string, targetType: r.target_type as ShareTargetType, targetId: r.target_id as string,
    sharedWithUserId: r.shared_with_user_id as string, sharedWithUserName: r.user_name as string,
    permissionLevel: r.permission_level as SharePermissionLevel, createdByName: r.created_by_name as string, createdAt: r.created_at as string,
  }));
}
