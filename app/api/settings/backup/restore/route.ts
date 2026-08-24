import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { restoreBackup } from '@/lib/db/backup';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json();
  const filename = body.filename as string;
  if (!filename || body.confirm !== filename) {
    return NextResponse.json({ error: '복원할 파일명 확인이 일치하지 않습니다.' }, { status: 400 });
  }

  try {
    await restoreBackup(filename);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: `복원 실패: ${String(e)}` }, { status: 500 });
  }
}
