import { NextRequest, NextResponse } from 'next/server';
import { resolveShareByToken, getSharedPhotos, recordShareAccess, shareUnlockCookieName, verifyShareUnlockCookie } from '@/lib/photos/external-shares';

/** 공개(비인증) 라우트 — 토큰만으로 접근. 비밀번호가 걸려있고 아직 풀지 않았으면
 * 사진 목록 없이 needsPassword만 반환한다(요청서 44번). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = resolveShareByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const { share, needsPassword } = resolved;
  const unlocked = !needsPassword || verifyShareUnlockCookie(share.id, req.cookies.get(shareUnlockCookieName(share.id))?.value);
  if (!unlocked) {
    return NextResponse.json({ needsPassword: true, title: share.title });
  }

  recordShareAccess(share.id, 'view', req);
  const photos = getSharedPhotos(share);
  return NextResponse.json({
    needsPassword: false,
    title: share.title, message: share.message,
    allowDownload: share.allowDownload, allowOriginalDownload: share.allowOriginalDownload, allowZip: share.allowZip,
    photos,
  });
}
