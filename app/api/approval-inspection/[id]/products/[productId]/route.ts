import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, sortOrder: row.sort_order,
    productCategory: row.product_category, productName: row.product_name, modelName: row.model_name,
    manufacturer: row.manufacturer, productionLot: row.production_lot,
    dimensions: row.dimensions, weightG: row.weight_g, certNumber: row.cert_number, remark: row.remark,
    overallJudgement: row.overall_judgement, internalOpinion: row.internal_opinion,
  };
}

const EDITABLE_FIELDS: Record<string, string> = {
  productCategory: 'product_category', productName: 'product_name', modelName: 'model_name',
  manufacturer: 'manufacturer', productionLot: 'production_lot',
  dimensions: 'dimensions', weightG: 'weight_g', certNumber: 'cert_number', remark: 'remark',
  overallJudgement: 'overall_judgement', internalOpinion: 'internal_opinion',
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });
  const before = db.prepare('SELECT * FROM approval_inspection_products WHERE id=? AND project_id=? AND deleted=0').get(productId, id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) { sets.push(`${col}=?`); values.push(body[key] ?? null); }
  }
  if (sets.length === 0) return NextResponse.json({ error: '변경할 값이 없습니다.' }, { status: 400 });
  sets.push('updated_at=?'); values.push(now()); values.push(productId);
  db.prepare(`UPDATE approval_inspection_products SET ${sets.join(', ')} WHERE id=?`).run(...values);

  writeInspectionAuditLog({ projectId: id, action: 'product_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, after: body, req });
  const row = db.prepare('SELECT * FROM approval_inspection_products WHERE id=?').get(productId) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });
  const before = db.prepare('SELECT * FROM approval_inspection_products WHERE id=? AND project_id=? AND deleted=0').get(productId, id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  db.prepare('UPDATE approval_inspection_products SET deleted=1, updated_at=? WHERE id=?').run(now(), productId);
  writeInspectionAuditLog({ projectId: id, action: 'product_delete', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, req });
  return NextResponse.json({ ok: true });
}
