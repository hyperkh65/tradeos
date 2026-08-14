import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'imports')
  : process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads/imports'
    : path.join(process.cwd(), 'data/uploads/imports');

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  const { id, filename } = await params;
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOAD_BASE, id, safeName);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(safeName).slice(1).toLowerCase();
  return new NextResponse(buf, {
    headers: {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'no-cache',
    },
  });
}
