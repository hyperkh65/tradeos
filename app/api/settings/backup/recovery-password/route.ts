import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { setRecoveryPassword, hasRecoveryPassword } from '@/lib/backup/secrets';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
  return NextResponse.json({ data: { configured: hasRecoveryPassword() } });
}

/** Recovery Password를 설정/변경한다. 응답에 딱 한 번, 다운로드용 복구 시트 텍스트를
 * 함께 돌려준다 — 서버는 이 값을 그 뒤로 어디에도 평문으로 남기지 않는다(DB엔
 * AUTH_SECRET로 wrapping된 사본만 저장됨, vault.ts 참고). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const password = String(body.password || '');
  try {
    setRecoveryPassword(password);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const sheet = [
    'YNK 그룹웨어 — Disaster Recovery Password',
    '',
    `생성일: ${new Date().toISOString()}`,
    `설정자: ${user.name} (${user.email})`,
    '',
    `Recovery Password: ${password}`,
    '',
    '※ 이 파일은 백업이 저장된 외장 HDD와 절대 같은 곳에 보관하지 마세요.',
    '   이 비밀번호를 잃어버리면 암호화된 백업 안의 시크릿(API 토큰 등)을 복구할 수 없습니다.',
    '   (DB/첨부파일/애플리케이션 자체 복원에는 이 비밀번호가 필요 없습니다 — 시크릿 파트에만 필요합니다.)',
  ].join('\n');

  return NextResponse.json({ data: { success: true, recoverySheet: sheet } });
}
