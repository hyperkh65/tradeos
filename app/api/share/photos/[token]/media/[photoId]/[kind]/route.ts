import { NextRequest, NextResponse } from 'next/server';
import { resolveShareByToken, getSharedPhotos, recordShareAccess, shareUnlockCookieName, verifyShareUnlockCookie } from '@/lib/photos/external-shares';
import { getPhotoById, getDerivative, type DerivativeKind } from '@/lib/photos/db';
import { downloadPhotoFile } from '@/lib/photos/storage';
import { getOrCreateWatermarkedPreview } from '@/lib/photos/watermark';

const DERIVATIVE_KINDS: DerivativeKind[] = ['thumb_small', 'thumb_medium', 'preview_large'];

/** 외부 공유 페이지 전용 미디어 스트리밍 — 이 공유에 실제로 포함된 사진인지 매번 재검증한다
 * (토큰만 맞으면 photoId를 바꿔서 다른 사진에 접근하는 것을 막기 위함). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; photoId: string; kind: string }> }) {
  const { token, photoId, kind } = await params;
  const resolved = resolveShareByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const { share, needsPassword } = resolved;
  const unlocked = !needsPassword || verifyShareUnlockCookie(share.id, req.cookies.get(shareUnlockCookieName(share.id))?.value);
  if (!unlocked) return NextResponse.json({ error: '비밀번호가 필요합니다' }, { status: 401 });

  const sharedPhotos = getSharedPhotos(share);
  if (!sharedPhotos.some(p => p.id === photoId)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const photo = getPhotoById(photoId);
  if (!photo || photo.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let storedPath: string; let contentType: string; let disposition: 'inline' | 'attachment';

  if (kind === 'original') {
    if (!share.allowOriginalDownload) return NextResponse.json({ error: '원본 다운로드가 허용되지 않은 공유입니다' }, { status: 403 });
    storedPath = photo.storedPath; contentType = photo.mimeType; disposition = 'attachment';
  } else if (DERIVATIVE_KINDS.includes(kind as DerivativeKind)) {
    // 미리보기 표시 자체는 항상 허용(그리드 렌더용) — 다운로드 차단은 원본에서만 적용.
    // 워터마크 옵션이 켜진 공유는 실제 감상 크기(preview_large)만 워터마크를 입혀 내보낸다.
    if (kind === 'preview_large' && share.watermark) {
      const watermarked = await getOrCreateWatermarkedPreview(photoId);
      if (!watermarked) return NextResponse.json({ error: '미리보기를 사용할 수 없습니다' }, { status: 404 });
      storedPath = watermarked.storedPath; contentType = 'image/webp'; disposition = 'inline';
    } else {
      const derivative = getDerivative(photoId, kind as DerivativeKind);
      if (!derivative) return NextResponse.json({ error: '미리보기를 사용할 수 없습니다' }, { status: 404 });
      storedPath = derivative.storedPath; contentType = 'image/webp'; disposition = 'inline';
    }
  } else {
    return NextResponse.json({ error: '알 수 없는 종류입니다' }, { status: 400 });
  }

  const buf = await downloadPhotoFile(storedPath);
  if (!buf) return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 });

  if (kind === 'original') recordShareAccess(share.id, 'download', req);

  const encodedName = encodeURIComponent(photo.originalFileName);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      'Cache-Control': disposition === 'inline' ? 'private, max-age=3600' : 'private, no-store',
    },
  });
}
