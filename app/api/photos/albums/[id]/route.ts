import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { updateAlbum, softDeleteAlbum, getAlbumById } from '@/lib/photos/albums';
import { canViewOwned } from '@/lib/photos/permissions';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const album = getAlbumById(id);
  if (!album || album.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!canViewOwned(user, album.ownerUserId, album.isPublic)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  return NextResponse.json({ album });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = updateAlbum(user, id, {
    name: body.name,
    description: body.description,
    isPublic: body.isPublic,
    coverPhotoId: body.coverPhotoId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ album: result.album });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const result = softDeleteAlbum(user, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
