import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listAllTags } from '@/lib/photos/tags';

/** 태그 자동완성용 전체 목록(요청서 18번) — ?q=로 부분일치 검색. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const q = req.nextUrl.searchParams.get('q') || undefined;
  return NextResponse.json({ tags: listAllTags(q) });
}
