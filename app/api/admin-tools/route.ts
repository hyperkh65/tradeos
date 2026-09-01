import { NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { listAdminTools } from '@/lib/admin-tools/registry';

/** 관리자 도구 카드 그리드가 쓰는 목록 — registry 기반이라 새 도구가 추가돼도
 * 이 라우트는 손댈 필요가 없다(admin_tools에 행 하나 INSERT하면 자동 반영). */
export async function GET() {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ tools: listAdminTools() });
}
