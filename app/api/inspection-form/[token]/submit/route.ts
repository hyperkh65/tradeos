import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { createNotification } from '@/lib/notifications';
import { hasUnacknowledgedBlockingIssues } from '@/lib/approval-inspection/validate';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const body = await req.json().catch(() => ({}));
  const submitterName = (body.submitterName || '').trim();
  if (!submitterName) return NextResponse.json({ error: '제출자 이름을 입력해주세요.' }, { status: 400 });

  const db = getDb();
  const products = db.prepare('SELECT id FROM approval_inspection_products WHERE project_id=? AND deleted=0').all(project.id) as { id: string }[];
  if (products.length === 0) {
    return NextResponse.json({ error: '제품 정보를 최소 1개 이상 등록해야 제출할 수 있습니다.' }, { status: 400 });
  }

  // §8 물리적으로 불가능한 값(PF 범위 초과 등)은 확인 처리 전까지 제출을 막는다.
  const { blocked, issues } = hasUnacknowledgedBlockingIssues(project.id);
  if (blocked) {
    return NextResponse.json({ error: '측정값에 확인되지 않은 오류가 있어 제출할 수 없습니다.', issues: issues.filter(i => i.severity === 'blocking') }, { status: 400 });
  }

  const measurements = db.prepare('SELECT * FROM approval_inspection_measurements WHERE project_id=?').all(project.id);
  const wireSpecs = db.prepare('SELECT * FROM approval_inspection_wire_specs WHERE project_id=?').all(project.id);
  const photos = db.prepare('SELECT * FROM approval_inspection_photos WHERE project_id=? AND is_current=1').all(project.id) as Record<string, unknown>[];

  const versionRow = db.prepare('SELECT MAX(version_no) as v FROM approval_inspection_submission_versions WHERE project_id=?').get(project.id) as { v: number | null };
  const versionNo = (versionRow.v ?? 0) + 1;
  const isResubmit = versionNo > 1;
  const nextStatus = isResubmit ? 'resubmitted' : 'submitted';
  const ts = now();

  const dataSnapshot = { products, measurements, wireSpecs };

  db.transaction(() => {
    db.prepare(`INSERT INTO approval_inspection_submission_versions
      (id, project_id, version_no, submitted_at, submitted_by_name, status_at_submission, data_snapshot_json, attachments_snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId(), project.id, versionNo, ts, submitterName, nextStatus, JSON.stringify(dataSnapshot), JSON.stringify(photos), ts,
    );
    db.prepare(`UPDATE approval_inspection_projects SET status=?, updated_at=? WHERE id=?`).run(nextStatus, ts, project.id);
  })();

  writeInspectionAuditLog({
    projectId: project.id, action: isResubmit ? 'resubmit' : 'submit', actorType: 'external', actorTokenHash: hashToken(token),
    submissionVersion: versionNo, after: { submitterName, versionNo }, req,
  });

  if (project.created_by) {
    await createNotification({
      userIds: [project.created_by],
      type: 'approval_inspection_submitted',
      title: `[승인검사 자료제출] ${project.supplier_name || ''} - ${project.project_name}`,
      body: `제출일시: ${ts}\n제출자: ${submitterName}\n제출버전: v${versionNo}${isResubmit ? ' (재제출)' : ''}`,
      link: `/approval-inspection/${project.id}`,
      createdByName: submitterName,
    });
  }

  return NextResponse.json({ data: { status: nextStatus, versionNo } });
}
