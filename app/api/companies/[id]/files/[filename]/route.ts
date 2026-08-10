import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/companies'
  : path.join(process.cwd(), 'data/uploads/companies');

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; filename: string }> }) {
  try {
    const { id, filename } = await params;
    // Sanitize: no path traversal
    const safe = path.basename(filename);
    const filepath = path.join(UPLOAD_BASE, id, safe);

    if (!fs.existsSync(filepath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

    const buf = fs.readFileSync(filepath);
    const ext = safe.split('.').pop()?.toLowerCase() || '';
    const contentType = MIME[ext] || 'application/octet-stream';

    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${safe}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: '파일 오류' }, { status: 500 });
  }
}
