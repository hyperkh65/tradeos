import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();

    const row = db.prepare('SELECT * FROM users WHERE id=?').get(id) as Record<string, string> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    if (body.action === 'approve') {
      db.prepare('UPDATE users SET status=?,approved_by=?,approved_at=? WHERE id=?').run('approved', user.id, ts, id);
      return NextResponse.json({ success: true, message: '승인됐습니다.' });
    }
    if (body.action === 'reject') {
      db.prepare('UPDATE users SET status=? WHERE id=?').run('rejected', id);
      return NextResponse.json({ success: true, message: '거절됐습니다.' });
    }
    if (body.role) {
      db.prepare('UPDATE users SET role=? WHERE id=?').run(body.role, id);
    }
    if (body.status) {
      db.prepare('UPDATE users SET status=? WHERE id=?').run(body.status, id);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '오류 발생' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }
    const { id } = await params;
    if (id === user.id) return NextResponse.json({ error: '자기 자신은 삭제할 수 없습니다.' }, { status: 400 });
    const db = getDb();
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '오류 발생' }, { status: 500 });
  }
}
