import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { nasDownload } from '@/lib/storage/nas';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const item = db.prepare('SELECT * FROM file_items WHERE share_token=?').get(token) as Record<string,unknown> | undefined;

  if (!item) return NextResponse.json({ error: '링크가 유효하지 않습니다.' }, { status: 404 });
  if (item.share_expires_at && new Date(item.share_expires_at as string) < new Date()) {
    return NextResponse.json({ error: '링크가 만료되었습니다.' }, { status: 410 });
  }

  const buffer = await nasDownload(item.file_path as string);
  if (!buffer) return NextResponse.json({ error: '파일을 가져올 수 없습니다.' }, { status: 502 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': (item.file_type as string) || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.file_name as string)}`,
      'Content-Length': String(buffer.length),
    },
  });
}
