import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { validateProject } from '@/lib/approval-doc/validate';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const acked = new Set((db.prepare('SELECT issue_key FROM approval_doc_validation_acknowledgements WHERE project_id=?').all(id) as { issue_key: string }[]).map(r => r.issue_key));
  const issues = validateProject(id).map(i => ({ ...i, acknowledged: acked.has(i.key) }));
  return NextResponse.json({ data: issues });
}
