import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { createCompleteRecoveryPackage, listCompleteRecoveryPackages } from '@/lib/backup/package';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
  return NextResponse.json({ data: listCompleteRecoveryPackages() });
}

/** 관리자 화면의 [지금 전체 백업] 버튼 — Complete Recovery Package를 즉시 생성한다. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  try {
    const result = await createCompleteRecoveryPackage('manual', { password: body.password || undefined });
    return NextResponse.json({ data: result });
  } catch (e) {
    return NextResponse.json({ error: `백업 실패: ${(e as Error).message}` }, { status: 500 });
  }
}
