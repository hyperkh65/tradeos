import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { permanentlyDeletePhoto } from '@/lib/photos/trash';

/** 영구삭제 — 관리자만(요청서 36번), 확인 모달을 통과한 뒤 호출되어야 한다(프론트 책임). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const result = await permanentlyDeletePhoto(user, id, req);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
