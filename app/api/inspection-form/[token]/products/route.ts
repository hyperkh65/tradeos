import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { STANDARD_MEASUREMENT_ITEMS } from '@/lib/approval-inspection/types';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, sortOrder: row.sort_order,
    productCategory: row.product_category, productName: row.product_name, modelName: row.model_name,
    manufacturer: row.manufacturer, productionLot: row.production_lot,
    dimensions: row.dimensions, weightG: row.weight_g, certNumber: row.cert_number, remark: row.remark,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardInspectionFormRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_inspection_products WHERE project_id=? AND deleted=0 ORDER BY sort_order').all(guard.project.id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();

  const body = await req.json().catch(() => ({}));
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_inspection_products WHERE project_id=? AND deleted=0').get(project.id) as { m: number | null }).m;
  const sortOrder = (maxOrder ?? -1) + 1;
  const ts = now();
  const productId = newId();

  db.transaction(() => {
    db.prepare(`INSERT INTO approval_inspection_products
      (id, project_id, sort_order, product_category, product_name, model_name, manufacturer, production_lot,
       dimensions, weight_g, cert_number, remark, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      productId, project.id, sortOrder, body.productCategory ?? null, body.productName ?? null, body.modelName ?? null,
      body.manufacturer ?? null, body.productionLot ?? null, body.dimensions ?? null, body.weightG ?? null,
      body.certNumber ?? null, body.remark ?? null, ts, ts,
    );
    const insertMeasurement = db.prepare(`INSERT INTO approval_inspection_measurements
      (id, project_id, product_id, item_key, item_label, baseline_unit, measured_unit, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    STANDARD_MEASUREMENT_ITEMS.forEach((item, idx) => {
      insertMeasurement.run(newId(), project.id, productId, item.key, item.label, item.unit, item.unit, idx, ts, ts);
    });
  })();

  writeInspectionAuditLog({ projectId: project.id, action: 'product_create', actorType: 'external', actorTokenHash: hashToken(token), after: body, req });

  const row = db.prepare('SELECT * FROM approval_inspection_products WHERE id=?').get(productId) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();

  const body = await req.json().catch(() => ({}));
  const order: string[] = Array.isArray(body.order) ? body.order : [];
  if (order.length === 0) return NextResponse.json({ error: 'order 배열이 필요합니다.' }, { status: 400 });

  const update = db.prepare('UPDATE approval_inspection_products SET sort_order=?, updated_at=? WHERE id=? AND project_id=?');
  const ts = now();
  db.transaction(() => { order.forEach((productId, idx) => update.run(idx, ts, productId, project.id)); })();

  writeInspectionAuditLog({ projectId: project.id, action: 'product_reorder', actorType: 'external', actorTokenHash: hashToken(token), after: { order }, req });
  const rows = db.prepare('SELECT * FROM approval_inspection_products WHERE project_id=? AND deleted=0 ORDER BY sort_order').all(project.id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}
