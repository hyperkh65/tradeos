import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listSharesForTarget, createInternalShare, type SharePermissionLevel } from '@/lib/photos/internal-shares';

const LEVELS: SharePermissionLevel[] = ['view', 'download', 'upload', 'edit', 'share', 'delete'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ shares: listSharesForTarget('folder', id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const level: SharePermissionLevel = LEVELS.includes(body.permissionLevel) ? body.permissionLevel : 'view';
  if (typeof body.userId !== 'string') return NextResponse.json({ error: 'userId가 필요합니다' }, { status: 400 });
  const result = createInternalShare(user, 'folder', id, body.userId, level);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ share: result.data }, { status: 201 });
}
