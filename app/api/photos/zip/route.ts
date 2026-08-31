import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getSessionUser } from '@/lib/auth/session';
import { getPhotoById, canViewPhotoWithShares } from '@/lib/photos/db';
import { buildPhotoZipArchive, type ZipPhotoSpec } from '@/lib/photos/zip';
import { writePhotoAuditLog } from '@/lib/photos/audit';

/** 그리드 다중선택 → ZIP 일괄 다운로드(요청서 46번) — 원본 다운로드 권한(업로더/관리자)이
 * 있는 사진만 원본으로, 나머지는 조회 권한만 있으면 preview_large로 담는다. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const idsParam = req.nextUrl.searchParams.get('ids');
  const ids = idsParam ? idsParam.split(',').filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'ids가 필요합니다' }, { status: 400 });

  const specs: ZipPhotoSpec[] = [];
  for (const id of ids) {
    const photo = getPhotoById(id);
    if (!photo || photo.deletedAt || !canViewPhotoWithShares(user, photo)) continue;
    const canOriginal = user.role === 'admin' || photo.uploadedBy === user.id;
    specs.push({ id, originalFileName: photo.originalFileName, useOriginal: canOriginal });
  }
  if (specs.length === 0) return NextResponse.json({ error: '다운로드할 수 있는 사진이 없습니다' }, { status: 404 });

  const archive = buildPhotoZipArchive(specs);
  for (const s of specs) writePhotoAuditLog({ photoId: s.id, userId: user.id, userName: user.name, action: 'DOWNLOAD', req });

  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="photos_${new Date().toISOString().slice(0, 10)}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
