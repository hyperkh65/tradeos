import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getPhotoById, getPhotoOwnership } from '@/lib/photos/db';
import { canViewOwned } from '@/lib/photos/permissions';
import { updatePhotoDescription } from '@/lib/photos/tags';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const photo = getPhotoById(id);
  if (!photo || photo.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { ownerUserId, isPublic } = getPhotoOwnership(photo);
  if (!canViewOwned(user, ownerUserId, isPublic)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  return NextResponse.json({ photo });
}

/** 제목/설명 수정(요청서 20번, plain text) — 업로더 본인 또는 관리자만. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = updatePhotoDescription(user, id, { title: body.title, description: body.description });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
