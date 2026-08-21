import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') return NextResponse.json({ error: '관리자 전용' }, { status: 403 });
    const { name, email, password, role, department } = await req.json();
    if (!name || !email || !password) return NextResponse.json({ error: '이름, 이메일, 비밀번호 필수' }, { status: 400 });
    const db = getDb();
    const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (exists) return NextResponse.json({ error: '이미 등록된 이메일입니다.' }, { status: 409 });
    const hash = await bcrypt.hash(password, 10);
    const id = newId();
    const ts = now();
    db.prepare(
      `INSERT INTO users (id,email,name,password_hash,role,department,status,approved_by,approved_at,created_at)
       VALUES (?,?,?,?,?,?,'approved',?,?,?)`
    ).run(id, email, name, hash, role ?? 'staff', department || null, user.id, ts, ts);
    return NextResponse.json({ success: true, id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    const db = getDb();
    if (user.role === 'admin') {
      const rows = db.prepare('SELECT id,email,name,role,department,status,approved_at,created_at FROM users ORDER BY created_at DESC').all();
      return NextResponse.json({ data: rows });
    }
    // 일반 사용자: 결재라인 선택용 전체 목록
    const rows = db.prepare("SELECT id,name,department FROM users ORDER BY name ASC").all();
    return NextResponse.json({ data: rows });
  } catch {
    return NextResponse.json({ error: '오류 발생' }, { status: 500 });
  }
}
