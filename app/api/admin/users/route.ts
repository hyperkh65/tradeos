import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

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
