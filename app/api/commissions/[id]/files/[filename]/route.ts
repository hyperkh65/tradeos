import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/commissions'
  : path.join(process.cwd(), 'data/uploads/commissions');

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  const { id, filename } = await params;
  const safeName = path.basename(filename);
  const subdir = safeName.startsWith('deposit_') ? 'deposit' : 'invoice';
  const realName = safeName.replace(/^(deposit_|invoice_)/, '');
  const filepath = path.join(UPLOAD_BASE, id, subdir, realName);
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });
  const buf = fs.readFileSync(filepath);
  const ext = path.extname(realName).toLowerCase().slice(1);
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  try {
    const { id, filename } = await params;
    const safeName = path.basename(filename);
    const subdir = safeName.startsWith('deposit_') ? 'deposit' : 'invoice';
    const realName = safeName.replace(/^(deposit_|invoice_)/, '');
    const filepath = path.join(UPLOAD_BASE, id, subdir, realName);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    const db = getDb();
    const col = subdir === 'deposit' ? 'deposit_files_json' : 'invoice_files_json';
    const row = db.prepare(`SELECT ${col} FROM commissions WHERE id=?`).get(id) as Record<string, unknown> | undefined;
    if (row) {
      const list = (JSON.parse((row[col] as string) || '[]') as Array<{ filename: string }>).filter(f => f.filename !== realName);
      db.prepare(`UPDATE commissions SET ${col}=?, updated_at=? WHERE id=?`).run(JSON.stringify(list), now(), id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
