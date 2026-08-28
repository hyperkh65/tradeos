import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardApprovalDocRequest } from '@/lib/approval-doc/token';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { createNotification } from '@/lib/notifications';
import { hasUnacknowledgedBlockingIssues } from '@/lib/approval-doc/validate';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const body = await req.json().catch(() => ({}));
  const submitterName = (body.submitterName || '').trim();
  if (!submitterName) return NextResponse.json({ error: '제출자 이름을 입력해주세요.' }, { status: 400 });

  // 필수 섹션 누락 등 차단 이슈가 있으면(그리고 내부에서 아직 확인/승인 안 됐으면) 제출을
  // 막는다 — 요청서 §7 "필수 섹션은 누락 시 생성 차단" 원칙. 값을 자동으로 채우지 않고
  // 정확한 위치와 이유만 알려준다.
  const { blocked, issues } = hasUnacknowledgedBlockingIssues(project.id);
  if (blocked) {
    return NextResponse.json({ error: '필수 항목이 누락되어 제출할 수 없습니다.', issues: issues.filter(i => i.severity === 'blocking') }, { status: 400 });
  }

  const db = getDb();
  const sections = db.prepare('SELECT * FROM approval_doc_sections WHERE project_id=?').all(project.id);
  const generalSpec = db.prepare('SELECT * FROM approval_doc_general_spec_items WHERE project_id=?').all(project.id);
  const revisionHistory = db.prepare('SELECT * FROM approval_doc_revision_history WHERE project_id=?').all(project.id);
  const attachments = db.prepare('SELECT * FROM approval_doc_attachments WHERE project_id=? AND is_current=1').all(project.id) as Record<string, unknown>[];

  const versionRow = db.prepare('SELECT MAX(version_no) as v FROM approval_doc_submission_versions WHERE project_id=?').get(project.id) as { v: number | null };
  const versionNo = (versionRow.v ?? 0) + 1;
  const isResubmit = versionNo > 1;
  const nextStatus = isResubmit ? 'resubmitted' : 'submitted';
  const ts = now();

  const dataSnapshot = { sections, generalSpec, revisionHistory };

  db.transaction(() => {
    db.prepare(`INSERT INTO approval_doc_submission_versions
      (id, project_id, version_no, submitted_at, submitted_by_name, status_at_submission, data_snapshot_json, attachments_snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId(), project.id, versionNo, ts, submitterName, nextStatus, JSON.stringify(dataSnapshot), JSON.stringify(attachments), ts,
    );
    db.prepare(`UPDATE approval_doc_projects SET status=?, updated_at=? WHERE id=?`).run(nextStatus, ts, project.id);
    db.prepare(`UPDATE approval_doc_attachments SET submission_version=? WHERE project_id=? AND is_current=1`).run(versionNo, project.id);
  })();

  writeApprovalAuditLog({
    projectId: project.id, action: isResubmit ? 'resubmit' : 'submit', actorType: 'external', req,
    submissionVersion: versionNo, after: { submitterName, versionNo },
  });

  if (project.created_by) {
    await createNotification({
      userIds: [project.created_by],
      type: 'approval_doc_submitted',
      title: `[승인서 자료제출] ${project.supplier_name || ''} - ${project.product_name}`,
      body: `제출일시: ${ts}\n제출자: ${submitterName}\n제출버전: v${versionNo}${isResubmit ? ' (재제출)' : ''}`,
      link: `/approval-documents/${project.id}`,
      createdByName: submitterName,
    });
  }

  return NextResponse.json({ data: { status: nextStatus, versionNo } });
}
