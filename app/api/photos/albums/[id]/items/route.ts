import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { addPhotosToAlbum, listAlbumPhotoIds, getAlbumById } from '@/lib/photos/albums';
import { canViewOwned } from '@/lib/photos/permissions';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const album = getAlbumById(id);
  if (!album || album.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!canViewOwned(user, album.ownerUserId, album.isPublic)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  return NextResponse.json({ photoIds: listAlbumPhotoIds(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const photoIds: string[] = Array.isArray(body.photoIds) ? body.photoIds : [];
  if (photoIds.length === 0) return NextResponse.json({ error: 'photoIds가 필요합니다' }, { status: 400 });
  const result = addPhotosToAlbum(user, id, photoIds);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ added: result.added });
}
