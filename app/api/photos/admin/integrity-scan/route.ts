import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { isPhotoAdmin } from '@/lib/photos/permissions';
import { runPhotoIntegrityScan } from '@/lib/photos/integrity';

export const maxDuration = 120;

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!isPhotoAdmin(user)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  const result = await runPhotoIntegrityScan();
  return NextResponse.json({ result });
}
