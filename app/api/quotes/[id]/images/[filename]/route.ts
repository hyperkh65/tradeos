import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/quotes'
  : path.join(process.cwd(), 'data/uploads/quotes');

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  try {
    const { id, filename } = await params;
    const safe = path.basename(filename);
    const filepath = path.join(UPLOAD_BASE, id, safe);

    if (!fs.existsSync(filepath)) return NextResponse.json({ error: '이미지 없음' }, { status: 404 });

    const buf = fs.readFileSync(filepath);
    const ext = safe.split('.').pop()?.toLowerCase() || 'jpg';
    const contentType = MIME[ext] || 'image/jpeg';

    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: '이미지 오류' }, { status: 500 });
  }
}
