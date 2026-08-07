import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/sqlite';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
    const db = getDb();
    const row = db.prepare('SELECT id,email,name,role,department,status FROM users WHERE id=?').get(user.id) as Record<string, string> | undefined;
    if (!row) return NextResponse.json({ user });
    return NextResponse.json({ user: row });
  } catch {
    return NextResponse.json({ error: '오류 발생' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
    const { name, department } = await req.json();
    if (!name) return NextResponse.json({ error: '이름은 필수입니다.' }, { status: 400 });
    const db = getDb();
    db.prepare('UPDATE users SET name=?,department=? WHERE id=?').run(name, department ?? null, user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '오류 발생' }, { status: 500 });
  }
}
