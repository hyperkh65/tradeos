import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { nasDownload } from '@/lib/storage/nas';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const item = db.prepare('SELECT * FROM file_items WHERE id=?').get(id) as Record<string,unknown> | undefined;
  if (!item) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

  const buffer = await nasDownload(item.file_path as string);
  if (!buffer) return NextResponse.json({ error: 'NAS에서 파일을 가져올 수 없습니다.' }, { status: 502 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': (item.file_type as string) || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(item.file_name as string)}`,
      'Content-Length': String(buffer.length),
    },
  });
}
