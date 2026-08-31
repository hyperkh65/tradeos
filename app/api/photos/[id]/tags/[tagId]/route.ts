import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { removePhotoTag } from '@/lib/photos/tags';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; tagId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id, tagId } = await params;
  const result = removePhotoTag(user, id, tagId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
