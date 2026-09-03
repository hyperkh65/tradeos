import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

async function assertClosePermission(projectId: string) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 }) };
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=? AND deleted=0').get(projectId) as Record<string, unknown> | undefined;
  if (!project) return { error: NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 }) };
  if (user.role !== 'admin' && project.created_by !== user.id) {
    return { error: NextResponse.json({ error: '이 프로젝트를 마감/마감해제할 권한이 없습니다. 생성자 또는 관리자만 가능합니다.' }, { status: 403 }) };
  }
  return { user, project };
}

/** approval-doc/[id]/close와 동일한 패턴 — 마감 시점의 전체 데이터를 스냅샷으로
 * 보존해 이후 원본이 바뀌어도 "그때 마감한 내용"을 그대로 조회할 수 있게 한다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await assertClosePermission(id);
  if (check.error) return check.error;
  const { user, project } = check as { user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>; project: Record<string, unknown> };

  const body = await req.json().catch(() => ({}));
  const action = body.action === 'reopen' ? 'reopen' : 'close';
  const db = getDb();

  if (action === 'close') {
    if (project.status === 'closed') return NextResponse.json({ error: '이미 마감된 프로젝트입니다.' }, { status: 409 });

    const products = db.prepare('SELECT * FROM approval_inspection_products WHERE project_id=? AND deleted=0').all(id);
    const measurements = db.prepare('SELECT * FROM approval_inspection_measurements WHERE project_id=?').all(id);
    const wireSpecs = db.prepare('SELECT * FROM approval_inspection_wire_specs WHERE project_id=?').all(id);
    const samples = db.prepare('SELECT * FROM approval_inspection_samples WHERE project_id=?').all(id);
    const diffs = db.prepare('SELECT * FROM approval_inspection_diffs WHERE project_id=?').all(id);
    const photos = db.prepare('SELECT * FROM approval_inspection_photos WHERE project_id=? AND is_current=1').all(id);
    const latestVersion = db.prepare('SELECT MAX(version_no) as v FROM approval_inspection_submission_versions WHERE project_id=?').get(id) as { v: number | null };

    const dataSnapshot = { project, products, measurements, wireSpecs, samples, diffs };

    db.transaction(() => {
      db.prepare(`INSERT INTO approval_inspection_closure_snapshots
        (id, project_id, closed_by_user_id, closed_by_user_name, closed_at, submission_version_at_closure,
         data_snapshot_json, attachments_snapshot_json, reason_memo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        newId(), id, user.id, user.name, now(), latestVersion.v ?? 0,
        JSON.stringify(dataSnapshot), JSON.stringify(photos), body.reason ?? null,
      );
      db.prepare(`UPDATE approval_inspection_projects SET status='closed', updated_at=? WHERE id=?`).run(now(), id);
    })();

    writeInspectionAuditLog({ projectId: id, action: 'close', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req, after: { reason: body.reason } });
    return NextResponse.json({ data: { status: 'closed' } });
  }

  // reopen
  if (project.status !== 'closed') return NextResponse.json({ error: '마감된 프로젝트가 아닙니다.' }, { status: 409 });
  const latestClosure = db.prepare('SELECT id FROM approval_inspection_closure_snapshots WHERE project_id=? ORDER BY closed_at DESC LIMIT 1').get(id) as { id: string } | undefined;
  const hasSubmission = (db.prepare('SELECT COUNT(*) c FROM approval_inspection_submission_versions WHERE project_id=?').get(id) as { c: number }).c > 0;
  const reopenStatus = hasSubmission ? 'internal_review' : 'draft';

  db.transaction(() => {
    if (latestClosure) {
      db.prepare(`UPDATE approval_inspection_closure_snapshots SET reopened_at=?, reopened_by_user_id=?, reopened_by_user_name=?, reopen_reason=? WHERE id=?`)
        .run(now(), user.id, user.name, body.reason ?? null, latestClosure.id);
    }
    db.prepare(`UPDATE approval_inspection_projects SET status=?, updated_at=? WHERE id=?`).run(reopenStatus, now(), id);
  })();

  writeInspectionAuditLog({ projectId: id, action: 'reopen', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req, after: { reason: body.reason, newStatus: reopenStatus } });
  return NextResponse.json({ data: { status: reopenStatus } });
}
