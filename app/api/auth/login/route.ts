import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db/sqlite';
import bcrypt from 'bcryptjs';
import type { User } from '@/types';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 });
  }

  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(email) as Record<string, string> | undefined;

    if (!row) {
      return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    if (row.status === 'pending') {
      return NextResponse.json({ error: '관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.' }, { status: 403 });
    }
    if (row.status === 'rejected') {
      return NextResponse.json({ error: '가입이 거절됐습니다. 관리자에게 문의하세요.' }, { status: 403 });
    }

    const user: User = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as User['role'],
      department: row.department || undefined,
      permissions: row.role === 'admin' ? ['*'] : [],
    };

    const token = await createSession(user);
    const res = NextResponse.json({ success: true, user });
    res.cookies.set('tradeos_session', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
