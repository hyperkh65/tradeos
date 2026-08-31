import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listPhotosForEntity } from '@/lib/photos/entity-links';

/** 업무 화면(제품/검품/클레임/PO/선적/수입/거래처/견적/커미션 등)에 "관련 사진" 섹션으로
 * 붙이는 조회 전용 API — components/photos/related-photos.tsx가 사용한다. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const entityType = req.nextUrl.searchParams.get('entityType');
  const entityId = req.nextUrl.searchParams.get('entityId');
  if (!entityType || !entityId) return NextResponse.json({ error: 'entityType/entityId가 필요합니다' }, { status: 400 });
  return NextResponse.json({ photos: listPhotosForEntity(user, entityType, entityId) });
}
