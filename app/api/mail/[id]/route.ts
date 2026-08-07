import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const row = db.prepare('SELECT * FROM mail WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Not Found' }, { status: 404 });

    if (body.action === 'read') {
      const readBy = JSON.parse(row.read_by_json as string) as string[];
      if (!readBy.includes(user.id)) readBy.push(user.id);
      db.prepare('UPDATE mail SET read_by_json = ? WHERE id = ?').run(JSON.stringify(readBy), id);
    } else if (body.action === 'unread') {
      const readBy = (JSON.parse(row.read_by_json as string) as string[]).filter(uid => uid !== user.id);
      db.prepare('UPDATE mail SET read_by_json = ? WHERE id = ?').run(JSON.stringify(readBy), id);
    } else if (body.action === 'star') {
      const starredBy = JSON.parse(row.starred_by_json as string) as string[];
      if (!starredBy.includes(user.id)) starredBy.push(user.id);
      db.prepare('UPDATE mail SET starred_by_json = ? WHERE id = ?').run(JSON.stringify(starredBy), id);
    } else if (body.action === 'unstar') {
      const starredBy = (JSON.parse(row.starred_by_json as string) as string[]).filter(uid => uid !== user.id);
      db.prepare('UPDATE mail SET starred_by_json = ? WHERE id = ?').run(JSON.stringify(starredBy), id);
    }

    const updated = db.prepare('SELECT * FROM mail WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM mail WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
