import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

/** §19 버전관리 — 외부 제출 이력을 조회한다(재제출마다 스냅샷이 쌓임, submit/route.ts
 * 참고). data_snapshot_json은 목록에서는 무겁기만 하므로 크기만 알려주고 본문은 뺀다. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const rows = db.prepare(`
    SELECT id, version_no, submitted_at, submitted_by_name, status_at_submission, created_at
    FROM approval_inspection_submission_versions WHERE project_id=? ORDER BY version_no DESC
  `).all(id) as Record<string, unknown>[];
  return NextResponse.json({
    data: rows.map(r => ({ id: r.id, versionNo: r.version_no, submittedAt: r.submitted_at, submittedByName: r.submitted_by_name, statusAtSubmission: r.status_at_submission })),
  });
}
