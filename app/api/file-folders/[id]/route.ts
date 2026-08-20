import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: '폴더명 필수' }, { status: 400 });

  const db = getDb();
  const folder = db.prepare('SELECT * FROM file_folders WHERE id=?').get(id) as Record<string,unknown> | undefined;
  if (!folder) return NextResponse.json({ error: '폴더 없음' }, { status: 404 });
  if (folder.is_system) return NextResponse.json({ error: '시스템 폴더는 수정할 수 없습니다.' }, { status: 403 });

  db.prepare('UPDATE file_folders SET name=?,description=?,updated_at=? WHERE id=?')
    .run(body.name.trim(), body.description || null, now(), id);

  return NextResponse.json({ data: db.prepare('SELECT * FROM file_folders WHERE id=?').get(id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 폴더를 삭제할 수 있습니다.' }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const folder = db.prepare('SELECT * FROM file_folders WHERE id=?').get(id) as Record<string,unknown> | undefined;
  if (!folder) return NextResponse.json({ error: '폴더 없음' }, { status: 404 });
  if (folder.is_system) return NextResponse.json({ error: '시스템 폴더는 삭제할 수 없습니다.' }, { status: 403 });

  const fileCount = (db.prepare('SELECT COUNT(*) as n FROM file_items WHERE folder_id=?').get(id) as {n:number}).n;
  if (fileCount > 0) return NextResponse.json({ error: `폴더 안에 파일 ${fileCount}개가 있습니다.` }, { status: 400 });

  const childCount = (db.prepare('SELECT COUNT(*) as n FROM file_folders WHERE parent_id=?').get(id) as {n:number}).n;
  if (childCount > 0) return NextResponse.json({ error: `하위 폴더 ${childCount}개가 있습니다. 먼저 삭제하세요.` }, { status: 400 });

  db.prepare('DELETE FROM file_folders WHERE id=?').run(id);
  return NextResponse.json({ success: true });
}
