import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { runRestoreTest, listRestoreTestHistory } from '@/lib/backup/restore-test';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
  return NextResponse.json({ data: listRestoreTestHistory() });
}

/** [복구 테스트] 버튼 — 실제로 임시 디렉터리에 압축을 풀어 DB 무결성/체크섬을
 * 검증한다("Last Disaster Recovery Test"). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const filename = String(body.filename || '');
  if (!filename) return NextResponse.json({ error: '파일명이 필요합니다.' }, { status: 400 });

  try {
    const report = await runRestoreTest(filename);
    return NextResponse.json({ data: report });
  } catch (e) {
    return NextResponse.json({ error: `복구 테스트 실패: ${(e as Error).message}` }, { status: 500 });
  }
}
