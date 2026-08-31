import { getDb, newId, now } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { getPhotoById, canViewPhotoWithShares } from '@/lib/photos/db';
import { canEditOwned } from '@/lib/photos/permissions';
import { writePhotoAuditLog } from '@/lib/photos/audit';

export interface PhotoTagRow { id: string; name: string }

export type TagResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** 자동완성용 전체 태그 목록 — 기존 태그 우선(요청서 18번). */
export function listAllTags(query?: string): PhotoTagRow[] {
  const db = getDb();
  const rows = query
    ? db.prepare(`SELECT id, name FROM photo_tags WHERE name LIKE ? ORDER BY name ASC LIMIT 30`).all(`%${query}%`)
    : db.prepare(`SELECT id, name FROM photo_tags ORDER BY name ASC LIMIT 200`).all();
  return rows as PhotoTagRow[];
}

export function listPhotoTags(photoId: string): PhotoTagRow[] {
  const db = getDb();
  return db.prepare(`SELECT t.id, t.name FROM photo_tag_links l JOIN photo_tags t ON t.id = l.tag_id
    WHERE l.photo_id = ? ORDER BY t.name ASC`).all(photoId) as PhotoTagRow[];
}

function findOrCreateTag(name: string): PhotoTagRow {
  const db = getDb();
  const trimmed = name.trim();
  const existing = db.prepare(`SELECT id, name FROM photo_tags WHERE name = ?`).get(trimmed) as PhotoTagRow | undefined;
  if (existing) return existing;
  const id = newId();
  db.prepare(`INSERT INTO photo_tags (id, name, created_at) VALUES (?,?,?)`).run(id, trimmed, now());
  return { id, name: trimmed };
}

export function addPhotoTag(user: User, photoId: string, tagName: string): TagResult<PhotoTagRow> {
  const trimmed = tagName.trim();
  if (!trimmed) return { ok: false, error: '태그 이름이 비어있습니다', status: 400 };
  const photo = getPhotoById(photoId);
  if (!photo || photo.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canViewPhotoWithShares(user, photo)) return { ok: false, error: '권한이 없습니다', status: 403 };

  const db = getDb();
  const tag = findOrCreateTag(trimmed);
  const exists = db.prepare(`SELECT 1 FROM photo_tag_links WHERE photo_id=? AND tag_id=?`).get(photoId, tag.id);
  if (!exists) {
    db.prepare(`INSERT INTO photo_tag_links (photo_id, tag_id, created_by, created_at) VALUES (?,?,?,?)`)
      .run(photoId, tag.id, user.id, now());
    writePhotoAuditLog({ photoId, userId: user.id, userName: user.name, action: 'TAG_ADD', after: { tag: tag.name } });
  }
  return { ok: true, data: tag };
}

export function removePhotoTag(user: User, photoId: string, tagId: string): TagResult<null> {
  const photo = getPhotoById(photoId);
  if (!photo || photo.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canViewPhotoWithShares(user, photo)) return { ok: false, error: '권한이 없습니다', status: 403 };

  const db = getDb();
  const tag = db.prepare(`SELECT id, name FROM photo_tags WHERE id=?`).get(tagId) as PhotoTagRow | undefined;
  db.prepare(`DELETE FROM photo_tag_links WHERE photo_id=? AND tag_id=?`).run(photoId, tagId);
  if (tag) writePhotoAuditLog({ photoId, userId: user.id, userName: user.name, action: 'TAG_REMOVE', before: { tag: tag.name } });
  return { ok: true, data: null };
}

export interface UpdateDescriptionInput { title?: string | null; description?: string | null }

export function updatePhotoDescription(user: User, photoId: string, input: UpdateDescriptionInput): TagResult<null> {
  const photo = getPhotoById(photoId);
  if (!photo || photo.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, photo.uploadedBy)) return { ok: false, error: '권한이 없습니다', status: 403 };

  const db = getDb();
  const next = {
    title: input.title !== undefined ? input.title : photo.title,
    description: input.description !== undefined ? input.description : photo.description,
  };
  db.prepare(`UPDATE photos SET title=?, description=?, updated_by=?, updated_at=? WHERE id=?`)
    .run(next.title, next.description, user.id, now(), photoId);
  writePhotoAuditLog({
    photoId, userId: user.id, userName: user.name, action: 'EDIT_DESCRIPTION',
    before: { title: photo.title, description: photo.description }, after: next,
  });
  return { ok: true, data: null };
}
