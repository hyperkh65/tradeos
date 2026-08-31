import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listLinksForPhoto, linkPhotoToEntity } from '@/lib/photos/entity-links';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ links: listLinksForPhoto(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.entityType !== 'string' || typeof body.entityId !== 'string') {
    return NextResponse.json({ error: 'entityType/entityId가 필요합니다' }, { status: 400 });
  }
  const result = linkPhotoToEntity(user, id, body.entityType, body.entityId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ link: result.data }, { status: 201 });
}
