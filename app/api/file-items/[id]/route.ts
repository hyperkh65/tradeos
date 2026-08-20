import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { nasDelete } from '@/lib/storage/nas';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  const updates: string[] = [];
  const vals: unknown[] = [];
  if (body.folder_id !== undefined) { updates.push('folder_id=?'); vals.push(body.folder_id); }
  if (body.category !== undefined) { updates.push('category=?'); vals.push(body.category); }
  if (body.file_name !== undefined) { updates.push('file_name=?'); vals.push(body.file_name); }
  updates.push('updated_at=?'); vals.push(now());
  vals.push(id);

  db.prepare(`UPDATE file_items SET ${updates.join(',')} WHERE id=?`).run(...vals);
  return NextResponse.json({ data: db.prepare('SELECT * FROM file_items WHERE id=?').get(id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const item = db.prepare('SELECT * FROM file_items WHERE id=?').get(id) as Record<string,unknown> | undefined;
  if (!item) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

  // NAS 파일 삭제
  if (item.file_path) await nasDelete(item.file_path as string);

  db.prepare('DELETE FROM quote_extractions WHERE file_id=?').run(id);
  db.prepare('DELETE FROM file_items WHERE id=?').run(id);
  return NextResponse.json({ success: true });
}
