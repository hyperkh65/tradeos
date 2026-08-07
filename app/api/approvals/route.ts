import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

function genBusinessId(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `APR-${year}-${rand}`;
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    const rows = db.prepare('SELECT * FROM approvals ORDER BY created_at DESC').all();
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
    const business_id = genBusinessId();
    const createdAt = now();
    const steps = body.steps ?? [];
    db.prepare(`
      INSERT INTO approvals (id, business_id, form_type, form_title, requester_id, requester_name, steps_json, current_step, status, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      business_id,
      body.form_type,
      body.form_title,
      user.id,
      user.name,
      JSON.stringify(steps),
      1,
      '대기',
      body.description ?? null,
      createdAt,
      createdAt
    );
    const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
