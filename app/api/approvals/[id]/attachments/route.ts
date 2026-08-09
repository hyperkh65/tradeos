import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads'
    : path.join(process.cwd(), 'data', 'uploads'));

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_attachments WHERE approval_id = ? ORDER BY created_at ASC').all(id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const ext = path.extname(file.name);
  const filename = `${newId()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const db = getDb();
  const attId = newId();
  db.prepare(`
    INSERT INTO approval_attachments (id, approval_id, filename, original_name, mime_type, size, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(attId, id, filename, file.name, file.type, file.size, user.id, now());

  const row = db.prepare('SELECT * FROM approval_attachments WHERE id = ?').get(attId);
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { attId } = await req.json();

  const db = getDb();
  const att = db.prepare('SELECT * FROM approval_attachments WHERE id = ? AND approval_id = ?').get(attId, id) as Record<string, string> | undefined;
  if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filePath = path.join(UPLOAD_DIR, att.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM approval_attachments WHERE id = ?').run(attId);
  return NextResponse.json({ ok: true });
}
