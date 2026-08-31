import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { revokeExternalShare, getShareToken, listShareAccessLogs, listAllExternalShares, listMyExternalShares } from '@/lib/photos/external-shares';
import { isPhotoAdmin } from '@/lib/photos/permissions';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = revokeExternalShare(user, id, body.reason);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

/** 링크 원문 재확인(관리자 화면에서 QR/복사용) + 접근 로그 — 만든 사람 또는 관리자만. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const visible = isPhotoAdmin(user) ? listAllExternalShares() : listMyExternalShares(user);
  if (!visible.some(s => s.id === id)) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
  const token = getShareToken(id);
  const logs = listShareAccessLogs(id);
  return NextResponse.json({ token, logs });
}
