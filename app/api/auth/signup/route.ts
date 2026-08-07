import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, department } = await req.json();
    if (!email || !password || !name) {
      return NextResponse.json({ error: '이름, 이메일, 비밀번호는 필수입니다.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
    }

    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (existing) {
      return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 });
    }

    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
    const role = userCount === 0 ? 'admin' : 'staff';
    const status = userCount === 0 ? 'approved' : 'pending';

    const hash = await bcrypt.hash(password, 10);
    const id = newId();
    const ts = now();

    db.prepare('INSERT INTO users (id,email,name,password_hash,role,department,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, email, name, hash, role, department ?? null, status, ts);

    return NextResponse.json({
      success: true,
      status,
      message: status === 'approved'
        ? '관리자 계정으로 가입되었습니다. 로그인하세요.'
        : '가입 신청이 완료됐습니다. 관리자 승인 후 로그인 가능합니다.',
    }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
