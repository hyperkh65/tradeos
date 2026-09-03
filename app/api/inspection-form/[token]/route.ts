import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { REPORT_TYPE_TITLE } from '@/lib/approval-inspection/types';
import type { Lang } from '@/lib/approval-inspection/types';

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
    supplierContact: row.supplier_contact, memo: row.memo,
    defaultLanguage: row.default_language, status: row.status,
    title: REPORT_TYPE_TITLE[row.report_type as 'pre_approval' | 'pre_shipment']?.[(row.default_language as Lang) || 'zh'],
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardInspectionFormRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  return NextResponse.json({ data: toClient(guard.project as unknown as Record<string, unknown>) });
}

/** 외부 작성자가 수정할 수 있는 필드 — 내부 전용 필드(internalContact, referenceProjectId
 * 등)는 제외한다. */
const EDITABLE_FIELDS: Record<string, string> = {
  supplierContact: 'supplier_contact', memo: 'memo',
  productionLotNo: 'production_lot_no', productionQty: 'production_qty', inspectionQty: 'inspection_qty',
  shippingDate: 'shipping_date',
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) { sets.push(`${col}=?`); values.push(body[key] ?? null); }
  }
  if (sets.length === 0) return NextResponse.json({ error: '변경할 값이 없습니다.' }, { status: 400 });

  const db = getDb();
  sets.push('updated_at=?'); values.push(now()); values.push(project.id);
  db.prepare(`UPDATE approval_inspection_projects SET ${sets.join(', ')} WHERE id=?`).run(...values);

  writeInspectionAuditLog({ projectId: project.id, action: 'draft_save', actorType: 'external', actorTokenHash: hashToken(token), after: body, req });

  const row = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=?').get(project.id) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) });
}
