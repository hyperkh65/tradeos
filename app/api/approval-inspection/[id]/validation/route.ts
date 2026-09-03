import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { validateProject } from '@/lib/approval-inspection/validate';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const issues = validateProject(id);
  const acked = new Set((db.prepare('SELECT issue_key FROM approval_inspection_validation_acknowledgements WHERE project_id=?').all(id) as { issue_key: string }[]).map(r => r.issue_key));
  return NextResponse.json({ data: issues.map(i => ({ ...i, acknowledged: acked.has(i.key) })) });
}

/** §8 경고를 "확인했다"고 표시하는 워크플로우 — 값을 자동으로 고치지 않고,
 * 사람이 검토했다는 기록만 남긴다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.issueKey?.trim()) return NextResponse.json({ error: 'issueKey는 필수입니다.' }, { status: 400 });

  db.prepare(`INSERT INTO approval_inspection_validation_acknowledgements
    (id, project_id, issue_key, acknowledged_by, acknowledged_by_name, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(newId(), id, body.issueKey.trim(), user.id, user.name, body.note ?? null, now());

  return NextResponse.json({ ok: true });
}
