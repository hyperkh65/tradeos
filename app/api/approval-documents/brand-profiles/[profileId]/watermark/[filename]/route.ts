import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { UPLOAD_BASE } from '../route';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ profileId: string; filename: string }> }) {
  const { filename } = await params;
  if (!/^[\w.-]+$/.test(filename)) return NextResponse.json({ error: '잘못된 파일명입니다.' }, { status: 400 });
  const filepath = path.join(UPLOAD_BASE, filename);
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '없음' }, { status: 404 });
  const ext = filename.split('.').pop()?.toLowerCase();
  const contentType = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/jpeg';
  return new NextResponse(new Uint8Array(fs.readFileSync(filepath)), { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' } });
}
