import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, reportType: row.report_type,
    titleOverride: row.title_override, projectName: row.project_name,
    internalRefNo: row.internal_ref_no, customerName: row.customer_name,
    supplierName: row.supplier_name, manufacturerName: row.manufacturer_name,
    productCategory: row.product_category, productName: row.product_name, baseModelName: row.base_model_name,
    poNumber: row.po_number, piNumber: row.pi_number, productionLotNo: row.production_lot_no,
    productionQty: row.production_qty, inspectionQty: row.inspection_qty,
    shipDate: row.ship_date, shippingDate: row.shipping_date, requestDate: row.request_date, dueDate: row.due_date,
    internalContact: row.internal_contact, supplierContact: row.supplier_contact, memo: row.memo,
    referenceProjectId: row.reference_project_id, defaultLanguage: row.default_language,
    status: row.status, createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });
  return NextResponse.json({ data: toClient(row) });
}

const EDITABLE_FIELDS: Record<string, string> = {
  titleOverride: 'title_override', projectName: 'project_name', internalRefNo: 'internal_ref_no',
  customerName: 'customer_name', supplierName: 'supplier_name', manufacturerName: 'manufacturer_name',
  productCategory: 'product_category', productName: 'product_name', baseModelName: 'base_model_name',
  poNumber: 'po_number', piNumber: 'pi_number', productionLotNo: 'production_lot_no',
  productionQty: 'production_qty', inspectionQty: 'inspection_qty',
  shipDate: 'ship_date', shippingDate: 'shipping_date', requestDate: 'request_date', dueDate: 'due_date',
  internalContact: 'internal_contact', supplierContact: 'supplier_contact', memo: 'memo',
  defaultLanguage: 'default_language',
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const before = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (before.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다. 먼저 마감을 해제하세요.' }, { status: 423 });

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) { sets.push(`${col}=?`); values.push(body[key] ?? null); }
  }
  if (sets.length === 0) return NextResponse.json({ error: '변경할 값이 없습니다.' }, { status: 400 });

  sets.push('updated_at=?');
  values.push(now());
  values.push(id);
  db.prepare(`UPDATE approval_inspection_projects SET ${sets.join(', ')} WHERE id=?`).run(...values);

  writeInspectionAuditLog({ projectId: id, action: 'project_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, after: body, req });

  const row = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const before = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });
  db.prepare('UPDATE approval_inspection_projects SET deleted=1, updated_at=? WHERE id=?').run(now(), id);
  writeInspectionAuditLog({ projectId: id, action: 'project_delete', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, req });
  return NextResponse.json({ ok: true });
}
