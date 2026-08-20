import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM task_links WHERE task_id = ? ORDER BY created_at ASC'
    ).all(id);
    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: taskId } = await params;
    const body = await req.json();
    const db = getDb();

    const linkId = newId();
    const ts = now();
    db.prepare(
      `INSERT INTO task_links (id, task_id, module, record_id, record_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(linkId, taskId, body.module, body.recordId, body.recordLabel ?? null, ts);

    const row = db.prepare('SELECT * FROM task_links WHERE id = ?').get(linkId);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: taskId } = await params;
    const url = new URL(req.url);
    const linkId = url.searchParams.get('linkId');
    if (!linkId) return NextResponse.json({ error: 'linkId required' }, { status: 400 });
    const db = getDb();
    db.prepare('DELETE FROM task_links WHERE id = ? AND task_id = ?').run(linkId, taskId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
