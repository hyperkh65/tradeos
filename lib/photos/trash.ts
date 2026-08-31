import { getDb, now } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { getPhotoById, getDerivatives } from '@/lib/photos/db';
import { canEditOwned, canPermanentlyDelete, isPhotoAdmin } from '@/lib/photos/permissions';
import { deletePhotoFile } from '@/lib/photos/storage';
import { writePhotoAuditLog } from '@/lib/photos/audit';
import { getPhotoSettings } from '@/lib/photos/settings';

export type TrashResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export interface TrashedPhotoRow {
  id: string; originalFileName: string; status: string; deletedAt: string; deletedBy: string | null;
  uploadedByName: string; folderId: string | null;
}

/** 요청서 33~35번: 소프트 삭제 → 휴지통 → 복원/영구삭제. 일반 사용자는 본인 업로드만,
 * 관리자는 전부 삭제/복원할 수 있다(canEditOwned와 동일한 규칙, favorite/tags와 통일). */
export function softDeletePhoto(user: User, photoId: string, req?: import('next/server').NextRequest): TrashResult<null> {
  const photo = getPhotoById(photoId);
  if (!photo || photo.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, photo.uploadedBy)) return { ok: false, error: '권한이 없습니다', status: 403 };

  const db = getDb();
  db.prepare(`UPDATE photos SET deleted_at=?, deleted_by=? WHERE id=?`).run(now(), user.id, photoId);
  writePhotoAuditLog({ photoId, userId: user.id, userName: user.name, action: 'DELETE', req });
  return { ok: true, data: null };
}

export function restorePhoto(user: User, photoId: string, req?: import('next/server').NextRequest): TrashResult<null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photos WHERE id=?`).get(photoId) as Record<string, unknown> | undefined;
  if (!row || !row.deleted_at) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, row.uploaded_by as string | null)) return { ok: false, error: '권한이 없습니다', status: 403 };

  db.prepare(`UPDATE photos SET deleted_at=NULL, deleted_by=NULL WHERE id=?`).run(photoId);
  writePhotoAuditLog({ photoId, userId: user.id, userName: user.name, action: 'RESTORE', req });
  return { ok: true, data: null };
}

/** 영구삭제 — 관리자만(요청서 36번, 위험한 작업). DB row + 원본/파생본 NAS 파일 +
 * 태그링크/즐겨찾기/엔티티링크/앨범포함 등 참조 정리까지 전부 지운다. */
export async function permanentlyDeletePhoto(user: User, photoId: string, req?: import('next/server').NextRequest): Promise<TrashResult<null>> {
  if (!canPermanentlyDelete(user)) return { ok: false, error: '관리자만 영구삭제할 수 있습니다', status: 403 };
  const photo = getPhotoById(photoId);
  if (!photo) return { ok: false, error: 'not found', status: 404 };

  const derivatives = getDerivatives(photoId);
  await deletePhotoFile(photo.storedPath).catch(() => {});
  for (const d of derivatives) await deletePhotoFile(d.storedPath).catch(() => {});

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM photo_derivatives WHERE photo_id=?`).run(photoId);
    db.prepare(`DELETE FROM photo_tag_links WHERE photo_id=?`).run(photoId);
    db.prepare(`DELETE FROM photo_comments WHERE photo_id=?`).run(photoId);
    db.prepare(`DELETE FROM photo_favorites WHERE photo_id=?`).run(photoId);
    db.prepare(`DELETE FROM photo_entity_links WHERE photo_id=?`).run(photoId);
    db.prepare(`DELETE FROM photo_album_items WHERE photo_id=?`).run(photoId);
    db.prepare(`DELETE FROM photo_internal_shares WHERE target_type='photo' AND target_id=?`).run(photoId);
    db.prepare(`DELETE FROM photo_share_items WHERE photo_id=?`).run(photoId);
    db.prepare(`DELETE FROM photos WHERE id=?`).run(photoId);
  });
  tx();

  writePhotoAuditLog({ photoId, userId: user.id, userName: user.name, action: 'PERMANENT_DELETE', before: { originalFileName: photo.originalFileName }, req });
  return { ok: true, data: null };
}

export function listTrash(user: User): TrashedPhotoRow[] {
  const db = getDb();
  const rows = isPhotoAdmin(user)
    ? db.prepare(`SELECT * FROM photos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all() as Record<string, unknown>[]
    : db.prepare(`SELECT * FROM photos WHERE deleted_at IS NOT NULL AND uploaded_by=? ORDER BY deleted_at DESC`).all(user.id) as Record<string, unknown>[];
  return rows.map(r => ({
    id: r.id as string, originalFileName: r.original_file_name as string, status: r.status as string,
    deletedAt: r.deleted_at as string, deletedBy: r.deleted_by as string | null,
    uploadedByName: r.uploaded_by_name as string, folderId: r.folder_id as string | null,
  }));
}

/** 관리자 설정의 휴지통 보관기간(기본 30일)이 지난 항목을 자동 영구삭제(요청서 37번).
 * lib/photos/worker.ts의 폴링 루프에서 썸네일 처리와 함께 주기적으로 호출한다. */
export async function purgeExpiredTrash(): Promise<number> {
  const settings = getPhotoSettings();
  const db = getDb();
  const cutoff = new Date(Date.now() - settings.trashRetentionDays * 86400000).toISOString();
  const expired = db.prepare(`SELECT id FROM photos WHERE deleted_at IS NOT NULL AND deleted_at < ?`).all(cutoff) as { id: string }[];
  if (expired.length === 0) return 0;

  const systemUser: User = { id: 'system', name: '시스템(자동정리)', email: 'system@internal', role: 'admin', permissions: ['*'] };
  let purged = 0;
  for (const row of expired) {
    const result = await permanentlyDeletePhoto(systemUser, row.id);
    if (result.ok) purged++;
  }
  return purged;
}
