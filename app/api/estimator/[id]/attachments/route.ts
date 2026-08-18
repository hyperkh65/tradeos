import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const UPLOAD_BASE = join(process.cwd(), 'data', 'estimator-att');

interface Attachment {
  id: string; name: string; filename: string; size: number; uploadedAt: string;
}

function getAtts(id: string): Attachment[] {
  const db = getDb();
  const row = db.prepare('SELECT attachments_json FROM estimator_cases WHERE id=?').get(id) as { attachments_json?: string } | undefined;
  try { return JSON.parse(row?.attachments_json || '[]'); } catch { return []; }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ data: getAtts(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

  const attId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ext = file.name.includes('.') ? file.name.split('.').pop()! : '';
  const filename = ext ? `${attId}.${ext}` : attId;

  const dir = join(UPLOAD_BASE, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()));

  const att: Attachment = { id: attId, name: file.name, filename, size: file.size, uploadedAt: now() };
  const existing = getAtts(id);
  existing.push(att);
  getDb().prepare('UPDATE estimator_cases SET attachments_json=? WHERE id=?').run(JSON.stringify(existing), id);

  return NextResponse.json({ data: att });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { attId } = await req.json();
  const existing = getAtts(id);
  const att = existing.find(a => a.id === attId);
  const updated = existing.filter(a => a.id !== attId);
  getDb().prepare('UPDATE estimator_cases SET attachments_json=? WHERE id=?').run(JSON.stringify(updated), id);
  if (att) {
    try { const { unlink } = await import('fs/promises'); await unlink(join(UPLOAD_BASE, id, att.filename)); } catch {}
  }
  return NextResponse.json({ success: true });
}
