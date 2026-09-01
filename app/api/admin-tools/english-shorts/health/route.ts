import { NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { getEnglishShortsHealth } from '@/lib/admin-tools/english-shorts/health';

export async function GET() {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const health = await getEnglishShortsHealth();
  return NextResponse.json(health);
}
