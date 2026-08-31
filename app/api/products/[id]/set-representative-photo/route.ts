import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getDb, now } from '@/lib/db/sqlite';
import { getPhotoById } from '@/lib/photos/db';
import { writePhotoAuditLog } from '@/lib/photos/audit';

/** 사진첩 사진을 제품의 대표 이미지로 지정(요청서 32번) — 기존 products.image_url
 * 컬럼을 그대로 재사용한다(사진 원본을 products용으로 복제 저장하지 않음). 사진첩
 * 미디어 라우트(인증 필요)를 가리키므로 제품 화면에서도 세션 쿠키로 정상 렌더된다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id: productId } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.photoId !== 'string') return NextResponse.json({ error: 'photoId가 필요합니다' }, { status: 400 });

  const photo = getPhotoById(body.photoId);
  if (!photo || photo.deletedAt || photo.status !== 'ready') {
    return NextResponse.json({ error: '사용할 수 없는 사진입니다' }, { status: 400 });
  }

  const db = getDb();
  const product = db.prepare(`SELECT id FROM products WHERE id=?`).get(productId);
  if (!product) return NextResponse.json({ error: '제품을 찾을 수 없습니다' }, { status: 404 });

  const imageUrl = `/api/photos/${photo.id}/media/preview_large`;
  db.prepare(`UPDATE products SET image_url=?, updated_at=? WHERE id=?`).run(imageUrl, now(), productId);
  writePhotoAuditLog({ photoId: photo.id, userId: user.id, userName: user.name, action: 'SET_REPRESENTATIVE', after: { entityType: 'product', entityId: productId } });

  return NextResponse.json({ ok: true, imageUrl });
}
