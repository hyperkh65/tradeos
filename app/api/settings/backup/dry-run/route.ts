import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { dryRunCheckPackage } from '@/lib/backup/dry-run';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const filename = String(body.filename || '');
  if (!filename) return NextResponse.json({ error: '파일명이 필요합니다.' }, { status: 400 });

  try {
    return NextResponse.json({ data: dryRunCheckPackage(filename) });
  } catch (e) {
    return NextResponse.json({ error: `검사 실패: ${(e as Error).message}` }, { status: 500 });
  }
}
