import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listSystemChanges, logSystemChange } from '@/lib/backup/change-log';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
  return NextResponse.json({ data: listSystemChanges() });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const summary = String(body.summary || '').trim();
  if (!summary) return NextResponse.json({ error: '요약을 입력하세요.' }, { status: 400 });
  logSystemChange({ category: String(body.category || 'manual'), summary, details: body.details || undefined, createdBy: user.name });
  return NextResponse.json({ data: listSystemChanges() });
}
