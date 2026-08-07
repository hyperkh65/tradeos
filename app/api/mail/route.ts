import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const folder = searchParams.get('folder') ?? 'inbox';
    const db = getDb();

    let rows: unknown[];
    if (folder === 'sent') {
      rows = db.prepare(
        'SELECT * FROM mail WHERE sender_id = ? ORDER BY created_at DESC'
      ).all(user.id);
    } else if (folder === 'starred') {
      const all = db.prepare('SELECT * FROM mail ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
      rows = all.filter(m => {
        const starred = JSON.parse(m.starred_by_json as string) as string[];
        return starred.includes(user.id);
      });
    } else {
      const all = db.prepare('SELECT * FROM mail ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
      rows = all.filter(m => {
        const receivers = JSON.parse(m.receiver_ids_json as string) as string[];
        return receivers.includes(user.id);
      });
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
    const id = newId();
    const createdAt = now();
    db.prepare(`
      INSERT INTO mail (id, sender_id, sender_name, receiver_ids_json, subject, body, read_by_json, starred_by_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      user.id,
      user.name,
      JSON.stringify(body.receiver_ids ?? []),
      body.subject,
      body.body,
      JSON.stringify([]),
      JSON.stringify([]),
      createdAt
    );
    const row = db.prepare('SELECT * FROM mail WHERE id = ?').get(id);
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
