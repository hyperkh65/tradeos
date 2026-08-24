import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getBackupDir } from '@/lib/db/backup';
import fs from 'fs';
import path from 'path';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const { filename } = await params;
  const safeName = path.basename(filename);
  const filePath = path.join(getBackupDir(), safeName);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });

  const buf = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(safeName)}"`,
    },
  });
}
