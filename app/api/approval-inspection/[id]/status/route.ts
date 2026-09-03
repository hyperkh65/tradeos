import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

/** 외부 제출/마감/수정요청 흐름이 자동으로 관리하는 상태(draft/submitted/resubmitted/
 * revision_requested/closed)는 이 라우트로 직접 바꿀 수 없다 — 내부 검토 단계
 * (internal_review/approved/conditional_approval/shipment_hold/revising)만
 * 담당자가 수동으로 전환한다. */
const MANUAL_STATUSES = new Set(['internal_review', 'approved', 'conditional_approval', 'shipment_hold', 'revising']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 마감해제 후 상태를 바꿀 수 있습니다.' }, { status: 423 });

  const body = await req.json().catch(() => ({}));
  if (!MANUAL_STATUSES.has(body.status)) {
    return NextResponse.json({ error: `상태값은 다음 중 하나여야 합니다: ${[...MANUAL_STATUSES].join(', ')}` }, { status: 400 });
  }

  const ts = now();
  db.prepare('UPDATE approval_inspection_projects SET status=?, updated_at=? WHERE id=?').run(body.status, ts, id);
  writeInspectionAuditLog({ projectId: id, action: 'project_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before: project, after: { status: body.status }, req });
  return NextResponse.json({ data: { status: body.status } });
}
