import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { resolveShareByToken, getSharedPhotos, recordShareAccess, shareUnlockCookieName, verifyShareUnlockCookie } from '@/lib/photos/external-shares';
import { buildPhotoZipArchive, type ZipPhotoSpec } from '@/lib/photos/zip';

/** 외부 공유 ZIP 일괄 다운로드 — allowZip이 꺼져 있으면 아예 막는다(요청서 46번). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = resolveShareByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const { share, needsPassword } = resolved;
  const unlocked = !needsPassword || verifyShareUnlockCookie(share.id, req.cookies.get(shareUnlockCookieName(share.id))?.value);
  if (!unlocked) return NextResponse.json({ error: '비밀번호가 필요합니다' }, { status: 401 });
  if (!share.allowZip) return NextResponse.json({ error: 'ZIP 다운로드가 허용되지 않은 공유입니다' }, { status: 403 });

  const photos = getSharedPhotos(share);
  if (photos.length === 0) return NextResponse.json({ error: '공유된 사진이 없습니다' }, { status: 404 });

  const specs: ZipPhotoSpec[] = photos.map(p => ({
    id: p.id, originalFileName: p.originalFileName, useOriginal: share.allowOriginalDownload, watermark: share.watermark,
  }));

  const archive = buildPhotoZipArchive(specs);
  recordShareAccess(share.id, 'zip', req);

  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="shared_photos.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
