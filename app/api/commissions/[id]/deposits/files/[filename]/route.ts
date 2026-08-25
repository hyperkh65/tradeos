import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/commission-deposits'
  : path.join(process.cwd(), 'data/uploads/commission-deposits');

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  const { id, filename } = await params;
  const safeName = path.basename(filename);
  const sepIdx = safeName.indexOf('_');
  if (sepIdx < 0) return NextResponse.json({ error: '파일 없음' }, { status: 404 });
  const depositId = safeName.slice(0, sepIdx);
  const realName = safeName.slice(sepIdx + 1);
  const filepath = path.join(UPLOAD_BASE, id, depositId, realName);
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });
  const buf = fs.readFileSync(filepath);
  const ext = path.extname(realName).toLowerCase().slice(1);
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' },
  });
}
