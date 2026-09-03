import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

/** 공급업체는 응답만 남길 수 있고(status는 내부만 변경) — 요청 자체를 지우거나
 * 완료 처리할 권한은 없다(내부 검토 후 확인해야 완료로 넘어가야 하므로). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string; requestId: string }> }) {
  const { token, requestId } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();
  const before = db.prepare('SELECT * FROM approval_inspection_revision_requests WHERE id=? AND project_id=?').get(requestId, project.id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.supplierResponse !== 'string' || !body.supplierResponse.trim()) {
    return NextResponse.json({ error: '응답 내용을 입력하세요.' }, { status: 400 });
  }
  db.prepare('UPDATE approval_inspection_revision_requests SET supplier_response=? WHERE id=?').run(body.supplierResponse.trim(), requestId);

  writeInspectionAuditLog({ projectId: project.id, action: 'revision_request_resolve', actorType: 'external', actorTokenHash: hashToken(token), after: { supplierResponse: body.supplierResponse }, req });
  const row = db.prepare('SELECT * FROM approval_inspection_revision_requests WHERE id=?').get(requestId) as Record<string, unknown>;
  return NextResponse.json({ data: row });
}
