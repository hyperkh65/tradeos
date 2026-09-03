import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string; productId: string; measurementId: string }> }) {
  const { token, productId, measurementId } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();
  const before = db.prepare('SELECT * FROM approval_inspection_measurements WHERE id=? AND product_id=? AND project_id=?').get(measurementId, productId, project.id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  db.prepare('DELETE FROM approval_inspection_measurements WHERE id=?').run(measurementId);
  writeInspectionAuditLog({ projectId: project.id, action: 'measurement_update', actorType: 'external', actorTokenHash: hashToken(token), before, req });
  return NextResponse.json({ ok: true });
}
