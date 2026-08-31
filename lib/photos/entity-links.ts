import { getDb, newId, now } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { getPhotoById, getPhotoOwnership } from '@/lib/photos/db';
import { canViewOwned, isPhotoAdmin } from '@/lib/photos/permissions';
import { writePhotoAuditLog } from '@/lib/photos/audit';

export type LinkResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export interface EntityLinkRow { id: string; photoId: string; entityType: string; entityId: string; createdAt: string }
export interface LinkedPhotoRow {
  id: string; linkId: string; originalFileName: string; status: string; title: string | null;
  width: number | null; height: number | null; uploadedAt: string;
}

/** 사진 ↔ 업무 엔티티 양방향 연결(요청서 28~31번). entity_type은 자유 문자열
 * (products/inspections/claims/purchase_orders/shipments/imports/companies/
 * quotes/sales/cost_records/commissions 등) — expenses.related_type과 같은
 * 제네릭 링크 관례를 그대로 따른다(조사결과). 엔티티별 권한은 각 화면이 이미
 * 모달을 열기 전에 검증했다고 보고, 여기서는 "사진을 볼 수 있는가"만 확인한다. */
export function linkPhotoToEntity(user: User, photoId: string, entityType: string, entityId: string): LinkResult<EntityLinkRow> {
  if (!entityType.trim() || !entityId.trim()) return { ok: false, error: 'entityType/entityId가 필요합니다', status: 400 };
  const photo = getPhotoById(photoId);
  if (!photo || photo.deletedAt) return { ok: false, error: 'not found', status: 404 };
  const { ownerUserId, isPublic } = getPhotoOwnership(photo);
  if (!canViewOwned(user, ownerUserId, isPublic)) return { ok: false, error: '권한이 없습니다', status: 403 };

  const db = getDb();
  const existing = db.prepare(`SELECT id FROM photo_entity_links WHERE photo_id=? AND entity_type=? AND entity_id=?`)
    .get(photoId, entityType, entityId) as { id: string } | undefined;
  if (existing) {
    const row = db.prepare(`SELECT id, photo_id, entity_type, entity_id, created_at FROM photo_entity_links WHERE id=?`).get(existing.id) as Record<string, unknown>;
    return { ok: true, data: mapLink(row) };
  }
  const id = newId();
  db.prepare(`INSERT INTO photo_entity_links (id, photo_id, entity_type, entity_id, created_by, created_by_name, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id, photoId, entityType, entityId, user.id, user.name, now());
  writePhotoAuditLog({ photoId, userId: user.id, userName: user.name, action: 'ENTITY_LINK', after: { entityType, entityId } });
  return { ok: true, data: { id, photoId, entityType, entityId, createdAt: now() } };
}

export function unlinkPhotoFromEntity(user: User, photoId: string, linkId: string): LinkResult<null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photo_entity_links WHERE id=? AND photo_id=?`).get(linkId, photoId) as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: 'not found', status: 404 };
  db.prepare(`DELETE FROM photo_entity_links WHERE id=?`).run(linkId);
  writePhotoAuditLog({ photoId, userId: user.id, userName: user.name, action: 'ENTITY_UNLINK', before: { entityType: row.entity_type, entityId: row.entity_id } });
  return { ok: true, data: null };
}

function mapLink(r: Record<string, unknown>): EntityLinkRow {
  return { id: r.id as string, photoId: r.photo_id as string, entityType: r.entity_type as string, entityId: r.entity_id as string, createdAt: r.created_at as string };
}

export function listLinksForPhoto(photoId: string): EntityLinkRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM photo_entity_links WHERE photo_id=? ORDER BY created_at DESC`).all(photoId) as Record<string, unknown>[];
  return rows.map(mapLink);
}

/** 특정 업무 화면(예: 제품 상세)에 "관련 사진" 섹션으로 보여줄 목록 — 삭제되지 않은 사진만,
 * 권한 있는 사진만(비공개 폴더의 남의 사진은 목록에서 제외). */
export function listPhotosForEntity(user: User, entityType: string, entityId: string): LinkedPhotoRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.*, l.id as link_id FROM photos p
    JOIN photo_entity_links l ON l.photo_id = p.id
    WHERE l.entity_type = ? AND l.entity_id = ? AND p.deleted_at IS NULL
    ORDER BY l.created_at DESC
  `).all(entityType, entityId) as Record<string, unknown>[];

  return rows
    .filter(r => {
      if (isPhotoAdmin(user)) return true;
      const folderId = r.folder_id as string | null;
      if (!folderId) return true;
      const folder = db.prepare(`SELECT is_public FROM photo_folders WHERE id=?`).get(folderId) as { is_public: number } | undefined;
      return (folder ? !!folder.is_public : true) || r.uploaded_by === user.id;
    })
    .map(r => ({
      id: r.id as string, linkId: r.link_id as string, originalFileName: r.original_file_name as string,
      status: r.status as string, title: r.title as string | null,
      width: r.width as number | null, height: r.height as number | null, uploadedAt: r.uploaded_at as string,
    }));
}
