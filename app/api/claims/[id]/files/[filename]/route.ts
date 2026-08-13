import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/claims'
  : path.join(process.cwd(), 'data/uploads/claims');

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
  const subdir = safeName.startsWith('reports_') ? 'reports' : 'images';
  const realName = safeName.replace(/^(reports_|images_)/, '');
  const filepath = path.join(UPLOAD_BASE, id, subdir, realName);
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });
  const buf = fs.readFileSync(filepath);
  const ext = path.extname(realName).toLowerCase().slice(1);
  return new NextResponse(buf, {
    headers: { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  try {
    const { id, filename } = await params;
    const safeName = path.basename(filename);
    const subdir = safeName.startsWith('reports_') ? 'reports' : 'images';
    const realName = safeName.replace(/^(reports_|images_)/, '');
    const filepath = path.join(UPLOAD_BASE, id, subdir, realName);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
