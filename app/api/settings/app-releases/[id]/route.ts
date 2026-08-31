import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const existing = db.prepare('SELECT id FROM app_releases WHERE id=?').get(id);
  if (!existing) return NextResponse.json({ error: '릴리스를 찾을 수 없습니다.' }, { status: 404 });

  const body = await req.json();
  const updates: string[] = [];
  const values: unknown[] = [];
  if (typeof body.active === 'boolean') { updates.push('active=?'); values.push(body.active ? 1 : 0); }
  if (typeof body.releaseNotes === 'string') { updates.push('release_notes=?'); values.push(body.releaseNotes.trim() || null); }
  if (typeof body.minimumOs === 'string') { updates.push('minimum_os=?'); values.push(body.minimumOs.trim() || null); }
  if (!updates.length) return NextResponse.json({ error: '수정할 항목이 없습니다.' }, { status: 400 });

  values.push(id);
  db.prepare(`UPDATE app_releases SET ${updates.join(', ')} WHERE id=?`).run(...values);
  const row = db.prepare('SELECT * FROM app_releases WHERE id = ?').get(id);
  return NextResponse.json({ data: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT file_path FROM app_releases WHERE id=?').get(id) as { file_path: string } | undefined;
  if (!row) return NextResponse.json({ error: '릴리스를 찾을 수 없습니다.' }, { status: 404 });

  db.prepare('DELETE FROM app_releases WHERE id=?').run(id);
  try { fs.unlinkSync(row.file_path); } catch { /* 파일이 이미 없어도 DB 삭제는 진행 */ }
  return NextResponse.json({ ok: true });
}
