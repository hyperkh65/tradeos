import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listAlbums, createAlbum } from '@/lib/photos/albums';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  return NextResponse.json({ albums: listAlbums(user) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: '앨범 이름이 필요합니다' }, { status: 400 });
  }
  const album = createAlbum(user, { name: body.name, description: body.description ?? null, isPublic: !!body.isPublic });
  return NextResponse.json({ album });
}
