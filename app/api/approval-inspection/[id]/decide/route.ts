import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { FINAL_DECISION_OPTIONS } from '@/lib/approval-inspection/types';
import type { ReportType } from '@/lib/approval-inspection/types';

/** §15 결재 — 최종 판정을 실제로 기록한다(문서에 빈 서명란만 남기지 않고, 결재자가
 * 고른 값이 그대로 생성 문서에 반영되도록). 판정값은 승인서 종류별 허용 목록
 * (FINAL_DECISION_OPTIONS)에 있는 값만 받는다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT report_type, status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { report_type: ReportType; status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });

  const body = await req.json().catch(() => ({}));
  const options = FINAL_DECISION_OPTIONS[project.report_type];
  if (!body.finalDecision || !options.includes(body.finalDecision)) {
    return NextResponse.json({ error: `판정값은 다음 중 하나여야 합니다: ${options.join(', ')}` }, { status: 400 });
  }

  const ts = now();
  db.prepare(`UPDATE approval_inspection_projects SET final_decision=?, decided_by=?, decided_by_name=?, decided_at=?, updated_at=? WHERE id=?`)
    .run(body.finalDecision, user.id, user.name, ts, ts, id);

  writeInspectionAuditLog({ projectId: id, action: 'project_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: { finalDecision: body.finalDecision }, req });

  const row = db.prepare('SELECT final_decision, decided_by_name, decided_at FROM approval_inspection_projects WHERE id=?').get(id);
  return NextResponse.json({ data: row });
}
