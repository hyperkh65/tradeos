import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { runBackupNow, runFullAppBackup } from '@/lib/db/backup';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind === 'full' ? 'full' : 'db';

  try {
    const result = kind === 'full' ? await runFullAppBackup('manual') : await runBackupNow('manual');
    return NextResponse.json({ data: result });
  } catch (e) {
    return NextResponse.json({ error: `백업 실패: ${String(e)}` }, { status: 500 });
  }
}
