import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get('channelId');
    const since = searchParams.get('since');
    const db = getDb();

    if (channelId) {
      const channel = db.prepare('SELECT status FROM channels WHERE id=?').get(channelId) as { status: string } | undefined;
      if (channel?.status === 'deleted' && user.role !== 'admin') {
        return NextResponse.json({ error: '삭제된 대화방입니다.' }, { status: 403 });
      }
    }

    let rows: unknown[];
    if (channelId && since) {
      rows = db.prepare(
        'SELECT * FROM messages WHERE channel_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 50'
      ).all(channelId, since);
    } else if (channelId) {
      rows = db.prepare(
        'SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 50'
      ).all(channelId);
    } else {
      rows = [];
    }
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const db = getDb();
    const channel = db.prepare('SELECT status FROM channels WHERE id=?').get(body.channelId) as { status: string } | undefined;
    if (channel?.status === 'deleted') return NextResponse.json({ error: '삭제된 대화방에는 메시지를 보낼 수 없습니다.' }, { status: 403 });
    const id = newId();
    const createdAt = now();
    db.prepare(`
      INSERT INTO messages (id, channel_id, sender_id, sender_name, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, body.channelId, user.id, user.name, body.content, createdAt);
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
