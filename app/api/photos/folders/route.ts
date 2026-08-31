import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listFolders, createFolder } from '@/lib/photos/folders';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const includeTrash = req.nextUrl.searchParams.get('trash') === '1';
  return NextResponse.json({ folders: listFolders(user, includeTrash) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: '폴더 이름이 필요합니다' }, { status: 400 });
  }
  const folder = createFolder(user, {
    name: body.name,
    parentFolderId: body.parentFolderId ?? null,
    isPublic: !!body.isPublic,
  });
  return NextResponse.json({ folder });
}
