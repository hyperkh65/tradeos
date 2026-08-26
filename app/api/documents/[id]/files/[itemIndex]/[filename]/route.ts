import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/documents'
  : path.join(process.cwd(), 'data/uploads/documents');

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; itemIndex: string; filename: string }> }) {
  const { id, itemIndex, filename } = await params;
  const safeName = path.basename(filename);
  const filepath = path.join(UPLOAD_BASE, id, path.basename(itemIndex), safeName);
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });
  const buf = fs.readFileSync(filepath);
  const ext = path.extname(safeName).toLowerCase().slice(1);
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemIndex: string; filename: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  try {
    const { id, itemIndex, filename } = await params;
    const safeName = path.basename(filename);
    const idx = Number(itemIndex);
    const filepath = path.join(UPLOAD_BASE, id, String(idx), safeName);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    const db = getDb();
    const row = db.prepare('SELECT data_json FROM documents WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (row) {
      const data = JSON.parse((row.data_json as string) || '{}');
      if (Array.isArray(data.items) && data.items[idx]) {
        data.items[idx].images = (data.items[idx].images || []).filter((im: { filename: string }) => im.filename !== safeName);
        db.prepare('UPDATE documents SET data_json=?, updated_at=? WHERE id=?').run(JSON.stringify(data), now(), id);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
