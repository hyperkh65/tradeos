import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/supplier-form/audit';

async function assertClosePermission(projectId: string) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 }) };
  const db = getDb();
  const project = db.prepare('SELECT * FROM supplier_request_projects WHERE id=?').get(projectId) as Record<string, unknown> | undefined;
  if (!project) return { error: NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 }) };
  if (user.role !== 'admin' && project.created_by !== user.id) {
    return { error: NextResponse.json({ error: '이 프로젝트를 마감/마감해제할 권한이 없습니다. 링크를 생성한 사용자 또는 관리자만 가능합니다.' }, { status: 403 }) };
  }
  return { user, project };
}

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

    const response = db.prepare('SELECT * FROM supplier_form_responses WHERE project_id=?').get(id) as Record<string, unknown> | undefined;
    const componentItems = db.prepare('SELECT * FROM supplier_component_items WHERE project_id=? AND deleted=0').all(id);
    const attachments = db.prepare('SELECT * FROM supplier_attachments WHERE project_id=? AND is_current=1').all(id);
    const latestVersion = db.prepare('SELECT MAX(version_no) as v FROM supplier_submission_versions WHERE project_id=?').get(id) as { v: number | null };

    const dataSnapshot = {
      converterType: response?.converter_type ?? null,
      formData: response ? JSON.parse((response.data_json as string) || '{}') : {},
      componentItems,
    };

    db.transaction(() => {
      db.prepare(`INSERT INTO supplier_closure_snapshots
        (id, project_id, closed_by_user_id, closed_by_user_name, closed_at, submission_version_at_closure,
         data_snapshot_json, attachments_snapshot_json, reason_memo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        newId(), id, user.id, user.name, now(), latestVersion.v ?? 0,
        JSON.stringify(dataSnapshot), JSON.stringify(attachments), body.reason ?? null,
      );
      db.prepare(`UPDATE supplier_request_projects SET status='closed', updated_at=? WHERE id=?`).run(now(), id);
    })();

    writeAuditLog({ projectId: id, action: 'close', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req, after: { reason: body.reason } });
    return NextResponse.json({ data: { status: 'closed' } });
  }

  // reopen
  if (project.status !== 'closed') return NextResponse.json({ error: '마감된 프로젝트가 아닙니다.' }, { status: 409 });
  const latestClosure = db.prepare('SELECT id FROM supplier_closure_snapshots WHERE project_id=? ORDER BY closed_at DESC LIMIT 1').get(id) as { id: string } | undefined;

  db.transaction(() => {
    if (latestClosure) {
      db.prepare(`UPDATE supplier_closure_snapshots SET reopened_at=?, reopened_by_user_id=?, reopened_by_user_name=?, reopen_reason=? WHERE id=?`)
        .run(now(), user.id, user.name, body.reason ?? null, latestClosure.id);
    }
    db.prepare(`UPDATE supplier_request_projects SET status='editing', updated_at=? WHERE id=?`).run(now(), id);
  })();

  writeAuditLog({ projectId: id, action: 'reopen', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req, after: { reason: body.reason } });
  return NextResponse.json({ data: { status: 'editing' } });
}
