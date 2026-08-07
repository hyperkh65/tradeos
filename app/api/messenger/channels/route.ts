import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    const rows = db.prepare('SELECT * FROM channels ORDER BY created_at ASC').all();
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
    const memberIds = body.member_ids ?? [];
    db.prepare(`
      INSERT INTO channels (id, name, type, description, member_ids_json, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name,
      body.type ?? 'public',
      body.description ?? null,
      JSON.stringify(memberIds),
      user.id,
      createdAt
    );
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
