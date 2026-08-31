import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/sqlite';
import { getFolderById } from '@/lib/photos/folders';
import { canViewOwned } from '@/lib/photos/permissions';
import { listPhotosForUser, type PhotoSortKey } from '@/lib/photos/search';

const SORT_KEYS: PhotoSortKey[] = ['uploaded_desc', 'uploaded_asc', 'captured_desc', 'captured_asc', 'name_asc', 'size_desc'];

/** 폴더 열람(folderId만) + 검색/필터/정렬/키셋 페이지네이션(요청서 21~26번, lib/photos/search.ts). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const folderIdParam = sp.get('folderId');
  const folderId = folderIdParam === 'null' || folderIdParam === '' || folderIdParam === null ? null : folderIdParam;

  // 순수 폴더 열람(검색 필터 없음)일 때만 폴더 자체의 조회 권한을 사전 체크한다 —
  // 검색 모드는 listPhotosForUser 내부 SQL WHERE에서 행 단위로 권한을 이미 강제한다.
  const hasSearchFilters = !!(sp.get('all') || sp.get('q') || sp.get('tag') || sp.get('uploader') || sp.get('dateFrom') || sp.get('dateTo') ||
    sp.get('capturedFrom') || sp.get('capturedTo') || sp.get('extension') || sp.get('albumId') || sp.get('entityType'));
  if (!hasSearchFilters && folderId) {
    const folder = getFolderById(folderId);
    if (!folder || folder.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (!canViewOwned(user, folder.ownerUserId, folder.isPublic)) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }
  }

  const sortParam = sp.get('sort');
  const sort: PhotoSortKey = SORT_KEYS.includes(sortParam as PhotoSortKey) ? (sortParam as PhotoSortKey) : 'uploaded_desc';

  const { photos: rows, nextCursor } = listPhotosForUser(user, {
    folderId,
    q: sp.get('q') || undefined,
    tag: sp.get('tag') || undefined,
    uploader: sp.get('uploader') || undefined,
    dateFrom: sp.get('dateFrom') || undefined,
    dateTo: sp.get('dateTo') || undefined,
    capturedFrom: sp.get('capturedFrom') || undefined,
    capturedTo: sp.get('capturedTo') || undefined,
    extension: sp.get('extension') || undefined,
    albumId: sp.get('albumId') || undefined,
    entityType: sp.get('entityType') || undefined,
    entityId: sp.get('entityId') || undefined,
    sort,
    cursor: sp.get('cursor') || undefined,
    limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
    forceAll: sp.get('all') === '1',
  });

  const db = getDb();
  const favoriteIds = rows.length
    ? new Set((db.prepare(`SELECT photo_id FROM photo_favorites WHERE user_id=? AND photo_id IN (${rows.map(() => '?').join(',')})`)
        .all(user.id, ...rows.map(r => r.id)) as { photo_id: string }[]).map(r => r.photo_id))
    : new Set<string>();

  const photos = rows.map(r => ({ ...r, isFavorited: favoriteIds.has(r.id) }));

  return NextResponse.json({ photos, nextCursor });
}
