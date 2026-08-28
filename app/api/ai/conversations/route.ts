import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listConversationsForUser } from '@/lib/ai/db';

/** 자기 자신의 대화 이력만 조회 가능 — admin이라 해도 이 API로는 다른 사용자
 * 대화를 볼 수 없다(감사 로그 열람은 별도의 admin 전용 경로에서 다룬다). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  return NextResponse.json({ data: listConversationsForUser(user.id) });
}
