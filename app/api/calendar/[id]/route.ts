import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    db.prepare(`
      UPDATE calendar_events SET
        title = COALESCE(?, title),
        type = COALESCE(?, type),
        date = COALESCE(?, date),
        end_date = ?,
        all_day = COALESCE(?, all_day),
        description = ?
      WHERE id = ?
    `).run(
      body.title ?? null,
      body.type ?? null,
      body.date ?? null,
      body.end_date ?? null,
      body.all_day !== undefined ? (body.all_day ? 1 : 0) : null,
      body.description ?? null,
      id
    );
    const event = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
    return NextResponse.json(event);
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
    db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
