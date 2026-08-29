import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { computeUserActivity, computeUnattributedSummary } from '@/lib/admin/user-activity';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  return NextResponse.json({ data: { users: computeUserActivity(), unattributed: computeUnattributedSummary() } });
}
