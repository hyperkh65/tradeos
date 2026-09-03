import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, sortOrder: row.sort_order,
    productCategory: row.product_category, productName: row.product_name, modelName: row.model_name,
    manufacturer: row.manufacturer, productionLot: row.production_lot,
    dimensions: row.dimensions, weightG: row.weight_g, certNumber: row.cert_number, specText: row.spec_text, remark: row.remark,
  };
}

const EDITABLE_FIELDS: Record<string, string> = {
  productCategory: 'product_category', productName: 'product_name', modelName: 'model_name',
  manufacturer: 'manufacturer', productionLot: 'production_lot',
  dimensions: 'dimensions', weightG: 'weight_g', certNumber: 'cert_number', specText: 'spec_text', remark: 'remark',
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();
  const before = db.prepare('SELECT * FROM approval_inspection_products WHERE id=? AND project_id=? AND deleted=0').get(productId, project.id) as Record<string, unknown> | undefined;
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

  writeInspectionAuditLog({ projectId: project.id, action: 'product_update', actorType: 'external', actorTokenHash: hashToken(token), before, after: body, req });
  const row = db.prepare('SELECT * FROM approval_inspection_products WHERE id=?').get(productId) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();
  const before = db.prepare('SELECT * FROM approval_inspection_products WHERE id=? AND project_id=? AND deleted=0').get(productId, project.id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  db.prepare('UPDATE approval_inspection_products SET deleted=1, updated_at=? WHERE id=?').run(now(), productId);
  writeInspectionAuditLog({ projectId: project.id, action: 'product_delete', actorType: 'external', actorTokenHash: hashToken(token), before, req });
  return NextResponse.json({ ok: true });
}
