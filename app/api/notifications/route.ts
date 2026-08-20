import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM notifications WHERE user_id = ?
       ORDER BY is_read ASC, created_at DESC LIMIT 50`
    ).all(user.id);
    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const ids: string[] = body.ids || [];
    if (!ids.length) return NextResponse.json({ success: true });
    const db = getDb();
    const ts = now();
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${placeholders})`
    ).run(user.id, ...ids);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
