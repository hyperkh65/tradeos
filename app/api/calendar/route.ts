import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    // 팀 전체 이벤트 반환 (created_by_name 포함)
    const events = db.prepare('SELECT * FROM calendar_events ORDER BY date ASC').all();
    return NextResponse.json(events);
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
      INSERT INTO calendar_events (id, title, type, date, end_date, all_day, description, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.title,
      body.type ?? 'personal',
      body.date,
      body.end_date ?? null,
      body.all_day !== undefined ? (body.all_day ? 1 : 0) : 1,
      body.description ?? null,
      user.id,
      createdAt
    );
    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    return NextResponse.json(event, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
