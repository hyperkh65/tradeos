import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

// 관리자 전용이 아니다 — 로그인한 모든 사용자가 데스크톱 앱을 내려받아 설치할 수 있어야 한다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT file_path, file_name FROM app_releases WHERE id=? AND active=1').get(id) as
    { file_path: string; file_name: string } | undefined;
  if (!row) return NextResponse.json({ error: '릴리스를 찾을 수 없습니다.' }, { status: 404 });
  if (!fs.existsSync(row.file_path)) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });

  const buf = fs.readFileSync(row.file_path);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      'Content-Length': String(buf.length),
    },
  });
}
