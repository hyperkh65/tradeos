import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

/** 내부 담당자가 상태를 resolved로 바꾸거나(공급업체 응답 확인 후 완료 처리) 취소한다. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, requestId } = await params;
  const db = getDb();
  const before = db.prepare('SELECT * FROM approval_inspection_revision_requests WHERE id=? AND project_id=?').get(requestId, id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const ts = now();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (typeof body.status === 'string' && ['open', 'resolved', 'cancelled'].includes(body.status)) {
    sets.push('status=?'); values.push(body.status);
    if (body.status === 'resolved') { sets.push('completed_at=?'); values.push(ts); }
  }
  if (typeof body.supplierResponse === 'string') { sets.push('supplier_response=?'); values.push(body.supplierResponse); }
  if (sets.length === 0) return NextResponse.json({ error: '변경할 값이 없습니다.' }, { status: 400 });
  values.push(requestId);
  db.prepare(`UPDATE approval_inspection_revision_requests SET ${sets.join(', ')} WHERE id=?`).run(...values);

  writeInspectionAuditLog({ projectId: id, action: 'revision_request_resolve', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, after: body, req });
  const row = db.prepare('SELECT * FROM approval_inspection_revision_requests WHERE id=?').get(requestId) as Record<string, unknown>;
  return NextResponse.json({ data: row });
}
