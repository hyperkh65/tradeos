import { getDb } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { isPhotoAdmin } from '@/lib/photos/permissions';

export type PhotoSortKey = 'uploaded_desc' | 'uploaded_asc' | 'captured_desc' | 'captured_asc' | 'name_asc' | 'size_desc';

export interface PhotoSearchParams {
  folderId?: string | null;
  q?: string;
  tag?: string;
  uploader?: string;
  dateFrom?: string;
  dateTo?: string;
  capturedFrom?: string;
  capturedTo?: string;
  extension?: string;
  albumId?: string;
  entityType?: string;
  entityId?: string;
  sort?: PhotoSortKey;
  cursor?: string;
  limit?: number;
  /** 필터가 하나도 없어도 폴더 범위를 무시하고 전체를 대상으로 검색(엔티티 연결 picker용). */
  forceAll?: boolean;
}

export interface PhotoListRow {
  id: string; originalFileName: string; width: number | null; height: number | null;
  fileSize: number; status: string; capturedAt: string | null; uploadedAt: string;
  uploadedBy: string; uploadedByName: string; title: string | null; description: string | null;
  folderId: string | null; extension: string;
}

const SORT_EXPR: Record<PhotoSortKey, { expr: string; dir: 'ASC' | 'DESC' }> = {
  uploaded_desc: { expr: 'p.uploaded_at', dir: 'DESC' },
  uploaded_asc: { expr: 'p.uploaded_at', dir: 'ASC' },
  // NULL 촬영일은 항상 맨 뒤로 보내기 위해 방향에 따라 다른 sentinel로 COALESCE한다.
  captured_desc: { expr: "COALESCE(p.captured_at, '0001-01-01')", dir: 'DESC' },
  captured_asc: { expr: "COALESCE(p.captured_at, '9999-12-31')", dir: 'ASC' },
  name_asc: { expr: 'p.original_file_name COLLATE NOCASE', dir: 'ASC' },
  size_desc: { expr: 'p.file_size', dir: 'DESC' },
};

function encodeCursor(sortValue: string | number, id: string): string {
  return Buffer.from(JSON.stringify([sortValue, id])).toString('base64url');
}
function decodeCursor(cursor: string): [string | number, string] | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2) return parsed as [string | number, string];
    return null;
  } catch {
    return null;
  }
}

/** 검색/필터/정렬/키셋 페이지네이션(요청서 21~26번). folderId만 있으면 기존처럼
 * 해당 폴더(또는 최상위)만 보고, q/tag/uploader/기간/확장자/앨범/엔티티 중 하나라도
 * 있으면 폴더 범위를 무시하고 사용자가 볼 수 있는 전체 사진을 대상으로 검색한다
 * (Google Photos류의 "검색은 전체 대상" 관례). */
export function listPhotosForUser(user: User, params: PhotoSearchParams): { photos: PhotoListRow[]; nextCursor: string | null } {
  const db = getDb();
  const limit = Math.min(Math.max(params.limit ?? 60, 1), 200);
  const sortKey = params.sort ?? 'uploaded_desc';
  const { expr: sortExpr, dir } = SORT_EXPR[sortKey];

  const isSearchMode = !!(params.forceAll || params.q || params.tag || params.uploader || params.dateFrom || params.dateTo ||
    params.capturedFrom || params.capturedTo || params.extension || params.albumId || params.entityType);

  const joins: string[] = [];
  const where: string[] = ['p.deleted_at IS NULL'];
  const args: unknown[] = [];

  if (!isSearchMode) {
    if (params.folderId) { where.push('p.folder_id = ?'); args.push(params.folderId); }
    else { where.push('p.folder_id IS NULL'); }
  }

  // 권한 — 관리자가 아니면 공개폴더/최상위/본인업로드만 (getPhotoOwnership과 동일한 규칙).
  if (!isPhotoAdmin(user)) {
    where.push(`(p.folder_id IS NULL OR EXISTS (SELECT 1 FROM photo_folders pf WHERE pf.id = p.folder_id AND pf.is_public = 1) OR p.uploaded_by = ?)`);
    args.push(user.id);
  }

  if (params.q) {
    where.push('(p.original_file_name LIKE ? OR p.title LIKE ? OR p.description LIKE ?)');
    const like = `%${params.q}%`;
    args.push(like, like, like);
  }
  if (params.tag) {
    joins.push('JOIN photo_tag_links ptl ON ptl.photo_id = p.id JOIN photo_tags pt ON pt.id = ptl.tag_id');
    where.push('pt.name = ?');
    args.push(params.tag);
  }
  if (params.uploader) {
    where.push('p.uploaded_by_name LIKE ?');
    args.push(`%${params.uploader}%`);
  }
  if (params.dateFrom) { where.push('p.uploaded_at >= ?'); args.push(params.dateFrom); }
  if (params.dateTo) { where.push('p.uploaded_at <= ?'); args.push(params.dateTo); }
  if (params.capturedFrom) { where.push('p.captured_at >= ?'); args.push(params.capturedFrom); }
  if (params.capturedTo) { where.push('p.captured_at <= ?'); args.push(params.capturedTo); }
  if (params.extension) { where.push('p.extension = ?'); args.push(params.extension.toLowerCase()); }
  if (params.albumId) {
    joins.push('JOIN photo_album_items pai ON pai.photo_id = p.id AND pai.album_id = ?');
    args.push(params.albumId);
  }
  if (params.entityType && params.entityId) {
    joins.push('JOIN photo_entity_links pel ON pel.photo_id = p.id AND pel.entity_type = ? AND pel.entity_id = ?');
    args.push(params.entityType, params.entityId);
  } else if (params.entityType) {
    joins.push('JOIN photo_entity_links pel ON pel.photo_id = p.id AND pel.entity_type = ?');
    args.push(params.entityType);
  }

  if (params.cursor) {
    const decoded = decodeCursor(params.cursor);
    if (decoded) {
      const [cv, cid] = decoded;
      const cmp = dir === 'DESC' ? '<' : '>';
      where.push(`((${sortExpr}) ${cmp} ? OR ((${sortExpr}) = ? AND p.id ${cmp} ?))`);
      args.push(cv, cv, cid);
    }
  }

  const sql = `SELECT DISTINCT p.* FROM photos p ${joins.join(' ')}
    WHERE ${where.join(' AND ')}
    ORDER BY (${sortExpr}) ${dir}, p.id ${dir}
    LIMIT ?`;
  args.push(limit + 1);

  const rows = db.prepare(sql).all(...args) as Record<string, unknown>[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const photos: PhotoListRow[] = page.map(r => ({
    id: r.id as string, originalFileName: r.original_file_name as string,
    width: r.width as number | null, height: r.height as number | null, fileSize: r.file_size as number,
    status: r.status as string, capturedAt: r.captured_at as string | null, uploadedAt: r.uploaded_at as string,
    uploadedBy: r.uploaded_by as string, uploadedByName: r.uploaded_by_name as string,
    title: r.title as string | null, description: r.description as string | null,
    folderId: r.folder_id as string | null, extension: r.extension as string,
  }));

  let nextCursor: string | null = null;
  if (hasMore && photos.length > 0) {
    const last = photos[photos.length - 1];
    const sortValue = sortKey.startsWith('captured') ? (last.capturedAt ?? (sortKey === 'captured_desc' ? '0001-01-01' : '9999-12-31'))
      : sortKey === 'name_asc' ? last.originalFileName
      : sortKey === 'size_desc' ? last.fileSize
      : last.uploadedAt;
    nextCursor = encodeCursor(sortValue as string | number, last.id);
  }

  return { photos, nextCursor };
}
