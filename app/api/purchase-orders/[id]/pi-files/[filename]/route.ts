import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/pi'
  : path.join(process.cwd(), 'data/uploads/pi');

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  const { id, filename } = await params;
  const safeName = path.basename(filename);
  const filepath = path.join(UPLOAD_BASE, id, safeName);
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });
  const buf = fs.readFileSync(filepath);
  const ext = path.extname(safeName).toLowerCase().slice(1);
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  const isDownload = safeName.startsWith('pi_stamped');
  return new NextResponse(buf, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': isDownload ? `attachment; filename="${safeName}"` : 'inline',
      'Cache-Control': 'no-cache',
    },
  });
}
