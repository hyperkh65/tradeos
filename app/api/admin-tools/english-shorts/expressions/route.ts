import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { listExpressions } from '@/lib/admin-tools/english-shorts/db';

export async function GET(req: NextRequest) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const search = req.nextUrl.searchParams.get('q') || undefined;
  return NextResponse.json({ expressions: listExpressions(search) });
}
