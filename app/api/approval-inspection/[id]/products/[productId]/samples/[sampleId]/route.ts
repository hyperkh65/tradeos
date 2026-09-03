import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

const EDITABLE_FIELDS: Record<string, string> = {
  sampleNo: 'sample_no', samplingMethod: 'sampling_method', inspectionDate: 'inspection_date',
  inspectionPlace: 'inspection_place', inspector: 'inspector', remark: 'remark',
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string; sampleId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId, sampleId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });
  const before = db.prepare('SELECT * FROM approval_inspection_samples WHERE id=? AND product_id=? AND project_id=?').get(sampleId, productId, id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) { sets.push(`${col}=?`); values.push(body[key] ?? null); }
  }
  if (sets.length === 0) return NextResponse.json({ error: '변경할 값이 없습니다.' }, { status: 400 });
  sets.push('updated_at=?'); values.push(now()); values.push(sampleId);
  db.prepare(`UPDATE approval_inspection_samples SET ${sets.join(', ')} WHERE id=?`).run(...values);

  writeInspectionAuditLog({ projectId: id, action: 'sample_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, after: body, req });
  const row = db.prepare('SELECT * FROM approval_inspection_samples WHERE id=?').get(sampleId) as Record<string, unknown>;
  return NextResponse.json({ data: row });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string; sampleId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId, sampleId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });
  const before = db.prepare('SELECT * FROM approval_inspection_samples WHERE id=? AND product_id=? AND project_id=?').get(sampleId, productId, id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  db.transaction(() => {
    db.prepare('DELETE FROM approval_inspection_sample_measurements WHERE sample_id=?').run(sampleId);
    db.prepare('DELETE FROM approval_inspection_samples WHERE id=?').run(sampleId);
  })();
  writeInspectionAuditLog({ projectId: id, action: 'sample_delete', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, req });
  return NextResponse.json({ ok: true });
}
