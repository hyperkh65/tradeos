import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getDb, now } from '@/lib/db/sqlite';
import { getPhotoById, getPhotoOwnership } from '@/lib/photos/db';
import { canViewOwned } from '@/lib/photos/permissions';

/** 사용자별 즐겨찾기(요청서 17번) — 다른 사람에게 자동 공유되지 않는다(본인만 조회). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const photo = getPhotoById(id);
  if (!photo || photo.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { ownerUserId, isPublic } = getPhotoOwnership(photo);
  if (!canViewOwned(user, ownerUserId, isPublic)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });

  const db = getDb();

  const existing = db.prepare(`SELECT 1 FROM photo_favorites WHERE photo_id=? AND user_id=?`).get(id, user.id);
  if (existing) {
    db.prepare(`DELETE FROM photo_favorites WHERE photo_id=? AND user_id=?`).run(id, user.id);
    return NextResponse.json({ favorited: false });
  }
  db.prepare(`INSERT INTO photo_favorites (photo_id, user_id, created_at) VALUES (?,?,?)`).run(id, user.id, now());
  return NextResponse.json({ favorited: true });
}
