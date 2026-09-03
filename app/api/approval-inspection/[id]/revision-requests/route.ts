import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, productId: row.product_id, targetField: row.target_field, targetPhotoId: row.target_photo_id,
    requestContent: row.request_content, requestedByName: row.requested_by_name, requestedAt: row.requested_at,
    supplierResponse: row.supplier_response, status: row.status, completedAt: row.completed_at,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  const rows = db.prepare('SELECT * FROM approval_inspection_revision_requests WHERE project_id=? ORDER BY requested_at DESC').all(id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

/** §16 내부 담당자의 항목/사진별 수정요청 — 외부 화면에는 경고색으로 노출된다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });

  const body = await req.json().catch(() => ({}));
  if (!body.requestContent?.trim()) return NextResponse.json({ error: '요청 내용은 필수입니다.' }, { status: 400 });

  const ts = now();
  const requestId = newId();
  db.prepare(`INSERT INTO approval_inspection_revision_requests
    (id, project_id, product_id, target_field, target_photo_id, request_content, requested_by, requested_by_name, requested_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`).run(
    requestId, id, body.productId ?? null, body.targetField ?? null, body.targetPhotoId ?? null,
    body.requestContent.trim(), user.id, user.name, ts, ts,
  );

  db.prepare(`UPDATE approval_inspection_projects SET status='revision_requested', updated_at=? WHERE id=?`).run(ts, id);

  writeInspectionAuditLog({ projectId: id, action: 'revision_request_create', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: body, req });
  const row = db.prepare('SELECT * FROM approval_inspection_revision_requests WHERE id=?').get(requestId) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}
