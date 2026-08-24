import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, docType: row.doc_type, title: row.title, status: row.status,
    data: JSON.parse((row.data_json as string) || '{}'),
    history: JSON.parse((row.history_json as string) || '[]'),
    createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const row = getDb().prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });
  return NextResponse.json({ data: toClient(row) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });

  const body = await req.json();
  const ts = now();
  const history = JSON.parse((existing.history_json as string) || '[]') as Array<{ at: string; by: string; action: string }>;
  const action = body.status && body.status !== existing.status
    ? (body.status === 'issued' ? '발행' : '수정')
    : '수정';
  history.push({ at: ts, by: user.name || user.id, action });

  db.prepare(`UPDATE documents SET title=?, status=?, data_json=?, history_json=?, updated_at=? WHERE id=?`).run(
    body.title ?? existing.title,
    body.status ?? existing.status,
    JSON.stringify(body.data ?? JSON.parse((existing.data_json as string) || '{}')),
    JSON.stringify(history),
    ts, id
  );

  const row = db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const existing = db.prepare('SELECT created_at FROM documents WHERE id=?').get(id) as { created_at: string } | undefined;
  if (!existing) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const isOld = new Date(existing.created_at) < oneMonthAgo;
  if (isOld && user.role !== 'admin') {
    return NextResponse.json({ error: '1개월 이상 지난 문서는 관리자만 삭제할 수 있습니다.' }, { status: 403 });
  }

  db.prepare('DELETE FROM documents WHERE id=?').run(id);
  return NextResponse.json({ ok: true });
}
