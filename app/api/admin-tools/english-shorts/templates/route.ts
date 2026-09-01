import { NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { listTemplates } from '@/lib/admin-tools/english-shorts/db';

export async function GET() {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ templates: listTemplates() });
}
