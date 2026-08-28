import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { ensureBuiltinTemplates } from '@/lib/approval-doc/templates';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  return NextResponse.json({ data: ensureBuiltinTemplates() });
}
