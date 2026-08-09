import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_comments WHERE approval_id = ? ORDER BY created_at ASC').all(id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: '내용을 입력하세요.' }, { status: 400 });

  const db = getDb();
  const cmtId = newId();
  db.prepare('INSERT INTO approval_comments (id, approval_id, user_id, user_name, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    cmtId, id, user.id, user.name, content.trim(), now()
  );
  return NextResponse.json(db.prepare('SELECT * FROM approval_comments WHERE id = ?').get(cmtId), { status: 201 });
}
