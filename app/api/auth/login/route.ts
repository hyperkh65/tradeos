import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth/session';
import { isDemoMode } from '@/lib/notion/client';
import { DEMO_USER } from '@/lib/demo-data';
import type { User } from '@/types';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  let user: User | null = null;

  if (isDemoMode()) {
    // Demo mode: any email/password works
    user = { ...DEMO_USER, email: email || DEMO_USER.email };
  } else {
    // TODO: look up user from Notion DB and verify bcrypt password
    return NextResponse.json({ error: '실제 인증은 Notion DB 설정 후 사용 가능합니다.' }, { status: 501 });
  }

  if (!user) {
    return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const token = await createSession(user);
  const res = NextResponse.json({ success: true, user });
  res.cookies.set('tradeos_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8h
    path: '/',
  });
  return res;
}
