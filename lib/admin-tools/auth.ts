import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import type { User } from '@/types';
import { canUseAdminTools, canManageAdminTools } from './permissions';

export type AdminApiResult = { ok: true; user: User } | { ok: false; response: NextResponse };

/** Admin Tools API 공용 인가 헬퍼 — 401(미인증)/403(비관리자)을 매 라우트가
 * 직접 호출해서 처리한다(middleware.ts는 세션 유효성만 검사하고 경로별 권한
 * 검사가 전혀 없으므로, 프론트 메뉴 숨김만으로 끝내지 않는다는 요구사항을
 * 만족하려면 여기서 서버사이드로 강제해야 한다). */
export async function requireAdminToolsUser(): Promise<AdminApiResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }) };
  }
  if (!canUseAdminTools(user)) {
    return { ok: false, response: NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 }) };
  }
  return { ok: true, user };
}

export async function requireAdminToolsManager(): Promise<AdminApiResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }) };
  }
  if (!canManageAdminTools(user)) {
    return { ok: false, response: NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 }) };
  }
  return { ok: true, user };
}
