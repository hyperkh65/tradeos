import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/forwarder-rates'
  : path.join(process.cwd(), 'data/uploads/forwarder-rates');

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, filename } = await params;
  const safeName = path.basename(filename);
  const filepath = path.join(UPLOAD_BASE, id, safeName);
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 404 });
  const ext = safeName.split('.').pop()?.toLowerCase() || '';
  return new NextResponse(new Uint8Array(fs.readFileSync(filepath)), {
    headers: { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' },
  });
}
