import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { createExternalShare, listAllExternalShares, listMyExternalShares } from '@/lib/photos/external-shares';
import { isPhotoAdmin } from '@/lib/photos/permissions';

/** 관리자 "외부 공유 관리" 화면(요청서 47번)은 전체를, 일반 사용자는 본인이 만든 것만. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const shares = isPhotoAdmin(user) ? listAllExternalShares() : listMyExternalShares(user);
  return NextResponse.json({ shares });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!['selection', 'folder', 'album'].includes(body.targetType)) {
    return NextResponse.json({ error: 'targetType이 필요합니다' }, { status: 400 });
  }
  const result = createExternalShare(user, {
    targetType: body.targetType,
    targetId: body.targetId ?? null,
    photoIds: Array.isArray(body.photoIds) ? body.photoIds : undefined,
    title: body.title || undefined,
    message: body.message || undefined,
    password: body.password || undefined,
    allowDownload: !!body.allowDownload,
    allowOriginalDownload: !!body.allowOriginalDownload,
    allowZip: !!body.allowZip,
    watermark: !!body.watermark,
    expiresInDays: body.expiresInDays ? Number(body.expiresInDays) : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`}/share/photos/${result.data.token}`;
  return NextResponse.json({ id: result.data.id, token: result.data.token, url: shareUrl }, { status: 201 });
}
