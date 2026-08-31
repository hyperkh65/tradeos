import { NextRequest, NextResponse } from 'next/server';
import { resolveShareByToken, checkSharePassword, signShareUnlock, shareUnlockCookieName, recordShareAccess } from '@/lib/photos/external-shares';

const UNLOCK_MAX_AGE_SEC = 2 * 60 * 60; // 2시간 — "제한시간 유지"(요청서 44번)

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = resolveShareByToken(token);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  if (!checkSharePassword(resolved.share.id, password)) {
    recordShareAccess(resolved.share.id, 'password_fail', req);
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(shareUnlockCookieName(resolved.share.id), signShareUnlock(resolved.share.id), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: UNLOCK_MAX_AGE_SEC, path: '/',
  });
  return res;
}
