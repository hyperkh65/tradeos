import { getDb, newId, now } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { canEditOwned, canViewOwned, isPhotoAdmin } from './permissions';
import { hasInternalShareAccess } from './internal-shares';

export interface PhotoFolderRow {
  id: string;
  name: string;
  parentFolderId: string | null;
  isPublic: boolean;
  ownerUserId: string | null;
  coverPhotoId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

function rowToFolder(r: Record<string, unknown>): PhotoFolderRow {
  return {
    id: r.id as string,
    name: r.name as string,
    parentFolderId: r.parent_folder_id as string | null,
    isPublic: !!r.is_public,
    ownerUserId: r.owner_user_id as string | null,
    coverPhotoId: r.cover_photo_id as string | null,
    createdBy: r.created_by as string | null,
    createdByName: r.created_by_name as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    deletedAt: r.deleted_at as string | null,
    deletedBy: r.deleted_by as string | null,
  };
}

export function getFolderById(id: string): PhotoFolderRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photo_folders WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToFolder(row) : null;
}

/** 공개/본인소유/관리자 + 사내 공유(요청서 38번)로 view 권한을 받은 경우까지 포함. */
export function canViewFolderWithShares(user: User, folder: PhotoFolderRow): boolean {
  if (canViewOwned(user, folder.ownerUserId, folder.isPublic)) return true;
  return hasInternalShareAccess(user.id, 'folder', folder.id, 'view');
}

/** user가 볼 수 있는 폴더만(휴지통 제외) — 공개 폴더 + 본인 소유 + 사내 공유 + 관리자는 전체. */
export function listFolders(user: User, includeTrash = false): PhotoFolderRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM photo_folders`).all() as Record<string, unknown>[];
  return rows
    .map(rowToFolder)
    .filter(f => (includeTrash ? true : !f.deletedAt))
    .filter(f => includeTrash ? (isPhotoAdmin(user) || f.ownerUserId === user.id) : canViewFolderWithShares(user, f));
}

export interface CreateFolderInput { name: string; parentFolderId: string | null; isPublic: boolean }

export function createFolder(user: User, input: CreateFolderInput): PhotoFolderRow {
  const db = getDb();
  const id = newId();
  const ts = now();
  // 공개(is_public) 최상위 구조는 관리자만 만들 수 있다(요청서 58번) — 일반 사용자가
  // isPublic=true를 요청해도 강제로 false + 본인 소유로 저장한다.
  const isPublic = input.isPublic && isPhotoAdmin(user);
  db.prepare(`INSERT INTO photo_folders (id, name, parent_folder_id, is_public, owner_user_id, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, input.name.trim(), input.parentFolderId, isPublic ? 1 : 0, isPublic ? null : user.id, user.id, user.name, ts, ts,
  );
  return getFolderById(id)!;
}

/** parentFolderId가 folderId 자신이거나 그 자손이면 순환이 생긴다 — 조상 체인을
 * 끝까지 타고 올라가 확인한다(요청서 14번: cycle이 생기지 않도록 검증). */
function wouldCreateCycle(db: ReturnType<typeof getDb>, folderId: string, newParentId: string): boolean {
  if (folderId === newParentId) return true;
  let current: string | null = newParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === folderId) return true;
    if (seen.has(current)) return true; // 기존 데이터에 이미 순환이 있으면 안전하게 차단
    seen.add(current);
    const row = db.prepare(`SELECT parent_folder_id FROM photo_folders WHERE id=?`).get(current) as { parent_folder_id: string | null } | undefined;
    current = row?.parent_folder_id ?? null;
  }
  return false;
}

export interface UpdateFolderInput { name?: string; parentFolderId?: string | null; isPublic?: boolean; coverPhotoId?: string | null }

export function updateFolder(user: User, id: string, input: UpdateFolderInput): { ok: true; folder: PhotoFolderRow } | { ok: false; error: string; status: number } {
  const folder = getFolderById(id);
  if (!folder || folder.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, folder.ownerUserId)) return { ok: false, error: '권한이 없습니다', status: 403 };

  const db = getDb();
  if (input.parentFolderId !== undefined && input.parentFolderId !== null) {
    if (!getFolderById(input.parentFolderId)) return { ok: false, error: '대상 폴더를 찾을 수 없습니다', status: 400 };
    if (wouldCreateCycle(db, id, input.parentFolderId)) return { ok: false, error: '폴더를 자기 자신 또는 하위 폴더 안으로 옮길 수 없습니다', status: 400 };
  }
  if (input.isPublic === true && !isPhotoAdmin(user)) return { ok: false, error: '공개 폴더 설정은 관리자만 할 수 있습니다', status: 403 };

  const next = {
    name: input.name ?? folder.name,
    parentFolderId: input.parentFolderId !== undefined ? input.parentFolderId : folder.parentFolderId,
    isPublic: input.isPublic ?? folder.isPublic,
    coverPhotoId: input.coverPhotoId !== undefined ? input.coverPhotoId : folder.coverPhotoId,
  };
  db.prepare(`UPDATE photo_folders SET name=?, parent_folder_id=?, is_public=?, cover_photo_id=?, updated_at=? WHERE id=?`)
    .run(next.name.trim(), next.parentFolderId, next.isPublic ? 1 : 0, next.coverPhotoId, now(), id);
  return { ok: true, folder: getFolderById(id)! };
}

export function softDeleteFolder(user: User, id: string): { ok: true } | { ok: false; error: string; status: number } {
  const folder = getFolderById(id);
  if (!folder || folder.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, folder.ownerUserId)) return { ok: false, error: '권한이 없습니다', status: 403 };
  const db = getDb();
  db.prepare(`UPDATE photo_folders SET deleted_at=?, deleted_by=?, updated_at=? WHERE id=?`).run(now(), user.id, now(), id);
  return { ok: true };
}

export function restoreFolder(user: User, id: string): { ok: true } | { ok: false; error: string; status: number } {
  const folder = getFolderById(id);
  if (!folder || !folder.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canEditOwned(user, folder.ownerUserId)) return { ok: false, error: '권한이 없습니다', status: 403 };
  const db = getDb();
  db.prepare(`UPDATE photo_folders SET deleted_at=NULL, deleted_by=NULL, updated_at=? WHERE id=?`).run(now(), id);
  return { ok: true };
}
