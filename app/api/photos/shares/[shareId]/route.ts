import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { revokeInternalShare } from '@/lib/photos/internal-shares';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { shareId } = await params;
  const result = revokeInternalShare(user, shareId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
