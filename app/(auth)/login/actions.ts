'use server';

import { redirect } from 'next/navigation';
import { createSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db/sqlite';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import type { User } from '@/types';

export async function loginAction(prevState: { error: string }, formData: FormData): Promise<{ error: string }> {
  const email = (formData.get('email') as string ?? '').trim();
  const password = (formData.get('password') as string ?? '').trim();

  if (!email || !password) {
    return { error: '이메일과 비밀번호를 입력하세요.' };
  }

  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(email) as Record<string, string> | undefined;

    if (!row) {
      return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
    }

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
    }

    if (row.status === 'pending') {
      return { error: '관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.' };
    }
    if (row.status === 'rejected') {
      return { error: '가입이 거절됐습니다. 관리자에게 문의하세요.' };
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
    const cookieStore = await cookies();
    cookieStore.set('tradeos_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    });
  } catch {
    return { error: '서버 오류가 발생했습니다.' };
  }

  redirect('/');
}
