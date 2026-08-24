import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { computeOrderTracking } from '@/lib/scm/order-tracking';

export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const data = computeOrderTracking();
  return NextResponse.json({ data });
}
