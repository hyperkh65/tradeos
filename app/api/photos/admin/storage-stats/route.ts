import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { isPhotoAdmin } from '@/lib/photos/permissions';
import { getPhotoStorageStats } from '@/lib/photos/storage-stats';

export const maxDuration = 60;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!isPhotoAdmin(user)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  const stats = await getPhotoStorageStats();
  return NextResponse.json({ stats });
}
