import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/sqlite';
import bcrypt from 'bcryptjs';

export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
    const { current, next } = await req.json();
    if (!current || !next) return NextResponse.json({ error: '현재/새 비밀번호를 입력하세요.' }, { status: 400 });
    if (next.length < 8) return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });

    const db = getDb();
    const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id) as { password_hash: string } | undefined;
    if (!row) return NextResponse.json({ error: '사용자 없음' }, { status: 404 });

    const match = await bcrypt.compare(current, row.password_hash);
    if (!match) return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 401 });

    const hash = await bcrypt.hash(next, 10);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '오류 발생' }, { status: 500 });
  }
}
