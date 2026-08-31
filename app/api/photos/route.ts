import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/sqlite';
import { getFolderById } from '@/lib/photos/folders';
import { canViewOwned } from '@/lib/photos/permissions';

/** 폴더 안 사진 목록 — Phase 7에서 검색/필터/정렬/cursor pagination으로 확장한다.
 * 지금은 folderId 하나만 받고 최신 업로드순으로 최대 500장까지 반환(그 이상은
 * Phase 7의 진짜 pagination에서 다룸 — 지금 단계에서 500장 넘는 폴더는 드묾). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const folderIdParam = req.nextUrl.searchParams.get('folderId');
  const folderId = folderIdParam === 'null' || folderIdParam === '' ? null : folderIdParam;

  if (folderId) {
    const folder = getFolderById(folderId);
    if (!folder || folder.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (!canViewOwned(user, folder.ownerUserId, folder.isPublic)) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }
  }

  const db = getDb();
  const rows = folderId
    ? db.prepare(`SELECT * FROM photos WHERE folder_id=? AND deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT 500`).all(folderId)
    : db.prepare(`SELECT * FROM photos WHERE folder_id IS NULL AND deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT 500`).all();

  const photos = (rows as Record<string, unknown>[]).map(r => ({
    id: r.id,
    originalFileName: r.original_file_name,
    width: r.width,
    height: r.height,
    fileSize: r.file_size,
    status: r.status,
    capturedAt: r.captured_at,
    uploadedAt: r.uploaded_at,
    uploadedBy: r.uploaded_by,
    uploadedByName: r.uploaded_by_name,
    title: r.title,
    folderId: r.folder_id,
  }));

  return NextResponse.json({ photos });
}
