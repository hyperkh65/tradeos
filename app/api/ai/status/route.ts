import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { isAIEnabled } from '@/lib/ai/enabled';

/** 일반 사용자용 최소 정보 — Qdrant/Cloudflare/Provider 같은 기술 용어는 절대 노출하지 않는다. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  return NextResponse.json({ enabled: isAIEnabled() });
}
