import { getDb, newId, now } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { canEditOwned, canViewOwned, isPhotoAdmin } from './permissions';
import { writePhotoAuditLog } from './audit';

export interface PhotoAlbumRow {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  ownerUserId: string | null;
  coverPhotoId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  photoCount: number;
}

function rowToAlbum(r: Record<string, unknown>): PhotoAlbumRow {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    isPublic: !!r.is_public,
    ownerUserId: r.owner_user_id as string | null,
    coverPhotoId: r.cover_photo_id as string | null,
    createdBy: r.created_by as string | null,
    createdByName: r.created_by_name as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    deletedAt: r.deleted_at as string | null,
    photoCount: (r.photo_count as number) ?? 0,
  };
}

export function getAlbumById(id: string): PhotoAlbumRow | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM photo_album_items i WHERE i.album_id = a.id) AS photo_count
    FROM photo_albums a WHERE a.id=?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToAlbum(row) : null;
}

export function listAlbums(user: User): PhotoAlbumRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM photo_album_items i WHERE i.album_id = a.id) AS photo_count
    FROM photo_albums a WHERE a.deleted_at IS NULL`).all() as Record<string, unknown>[];
  return rows.map(rowToAlbum).filter(a => canViewOwned(user, a.ownerUserId, a.isPublic));
}

export interface CreateAlbumInput { name: string; description?: string | null; isPublic: boolean }

export function createAlbum(user: User, input: CreateAlbumInput): PhotoAlbumRow {
  const db = getDb();
  const id = newId();
  const ts = now();
  const isPublic = input.isPublic && isPhotoAdmin(user);
  db.prepare(`INSERT INTO photo_albums (id, name, description, is_public, owner_user_id, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, input.name.trim(), input.description ?? null, isPublic ? 1 : 0, isPublic ? null : user.id, user.id, user.name, ts, ts,
  );
  return getAlbumById(id)!;
}

export interface UpdateAlbumInput { name?: string; description?: string | null; isPublic?: boolean; coverPhotoId?: string | null }

export function updateAlbum(user: User, id: string, input: UpdateAlbumInput): { ok: true; album: PhotoAlbumRow } | { ok: false; error: string; status: number } {
  const album = getAlbumById(id);
  if (!album || album.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, album.ownerUserId)) return { ok: false, error: '권한이 없습니다', status: 403 };
  if (input.isPublic === true && !isPhotoAdmin(user)) return { ok: false, error: '공개 앨범 설정은 관리자만 할 수 있습니다', status: 403 };

  const db = getDb();
  const next = {
    name: input.name ?? album.name,
    description: input.description !== undefined ? input.description : album.description,
    isPublic: input.isPublic ?? album.isPublic,
    coverPhotoId: input.coverPhotoId !== undefined ? input.coverPhotoId : album.coverPhotoId,
  };
  db.prepare(`UPDATE photo_albums SET name=?, description=?, is_public=?, cover_photo_id=?, updated_at=? WHERE id=?`)
    .run(next.name.trim(), next.description, next.isPublic ? 1 : 0, next.coverPhotoId, now(), id);
  return { ok: true, album: getAlbumById(id)! };
}

export function softDeleteAlbum(user: User, id: string): { ok: true } | { ok: false; error: string; status: number } {
  const album = getAlbumById(id);
  if (!album || album.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, album.ownerUserId)) return { ok: false, error: '권한이 없습니다', status: 403 };
  const db = getDb();
  db.prepare(`UPDATE photo_albums SET deleted_at=?, updated_at=? WHERE id=?`).run(now(), now(), id);
  return { ok: true };
}

/** 앨범에 사진을 추가한다 — 원본 파일을 복사하지 않고 photo_album_items가 참조만
 * 한다(요청서 15/40번: 사진 하나를 여러 앨범에 넣어도 원본 복제 없음). */
export function addPhotosToAlbum(user: User, albumId: string, photoIds: string[]): { ok: true; added: number } | { ok: false; error: string; status: number } {
  const album = getAlbumById(albumId);
  if (!album || album.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, album.ownerUserId)) return { ok: false, error: '권한이 없습니다', status: 403 };

  const db = getDb();
  const stmt = db.prepare(`INSERT OR IGNORE INTO photo_album_items (id, album_id, photo_id, added_by, added_at) VALUES (?,?,?,?,?)`);
  const ts = now();
  let added = 0;
  const tx = db.transaction(() => {
    for (const photoId of photoIds) {
      const info = stmt.run(newId(), albumId, photoId, user.id, ts);
      if (info.changes > 0) {
        added++;
        writePhotoAuditLog({ photoId, userId: user.id, userName: user.name, action: 'ADD_TO_ALBUM', after: { albumId } });
      }
    }
  });
  tx();
  return { ok: true, added };
}

export function removePhotoFromAlbum(user: User, albumId: string, photoId: string): { ok: true } | { ok: false; error: string; status: number } {
  const album = getAlbumById(albumId);
  if (!album) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, album.ownerUserId)) return { ok: false, error: '권한이 없습니다', status: 403 };
  const db = getDb();
  db.prepare(`DELETE FROM photo_album_items WHERE album_id=? AND photo_id=?`).run(albumId, photoId);
  writePhotoAuditLog({ photoId, userId: user.id, userName: user.name, action: 'REMOVE_FROM_ALBUM', after: { albumId } });
  return { ok: true };
}

export function listAlbumPhotoIds(albumId: string): string[] {
  const db = getDb();
  const rows = db.prepare(`SELECT photo_id FROM photo_album_items WHERE album_id=? ORDER BY added_at DESC`).all(albumId) as { photo_id: string }[];
  return rows.map(r => r.photo_id);
}
