import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getPhotoById, canViewPhotoWithShares } from '@/lib/photos/db';
import { updatePhotoDescription } from '@/lib/photos/tags';
import { softDeletePhoto } from '@/lib/photos/trash';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const photo = getPhotoById(id);
  if (!photo || photo.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!canViewPhotoWithShares(user, photo)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
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

/** 소프트 삭제(휴지통으로 이동) — 요청서 33번. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const result = softDeletePhoto(user, id, req);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
