import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { snapshotProjectData } from '@/lib/approval-inspection/snapshot';
import type { ReportType } from '@/lib/approval-inspection/types';

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

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const db = getDb();
  const reportType = req.nextUrl.searchParams.get('reportType');
  const rows = reportType
    ? db.prepare('SELECT * FROM approval_inspection_projects WHERE deleted=0 AND report_type=? ORDER BY created_at DESC').all(reportType) as Record<string, unknown>[]
    : db.prepare('SELECT * FROM approval_inspection_projects WHERE deleted=0 ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.projectName?.trim()) return NextResponse.json({ error: '프로젝트명은 필수입니다.' }, { status: 400 });
  const reportType: ReportType = body.reportType === 'pre_shipment' ? 'pre_shipment' : 'pre_approval';
  if (reportType === 'pre_shipment' && !body.referenceProjectId) {
    return NextResponse.json({ error: '출고선적승인서는 기준 사전승인서를 선택하거나(§2) "신규 작성"을 명시해야 합니다.' }, { status: 400 });
  }

  const db = getDb();

  let referenceProject: { id: string; report_type: string } | undefined;
  if (reportType === 'pre_shipment' && body.referenceProjectId) {
    referenceProject = db.prepare('SELECT id, report_type FROM approval_inspection_projects WHERE id=? AND deleted=0').get(body.referenceProjectId) as { id: string; report_type: string } | undefined;
    if (!referenceProject) return NextResponse.json({ error: '기준 사전승인서를 찾을 수 없습니다.' }, { status: 404 });
    if (referenceProject.report_type !== 'pre_approval') return NextResponse.json({ error: '기준 프로젝트는 사전승인서여야 합니다.' }, { status: 400 });
  }

  const id = newId();
  const businessId = nextBizId('AIR');
  const ts = now();

  db.prepare(`INSERT INTO approval_inspection_projects
    (id, business_id, report_type, title_override, project_name, internal_ref_no, customer_name, supplier_name,
     manufacturer_name, product_category, product_name, base_model_name, po_number, pi_number, production_lot_no,
     production_qty, inspection_qty, ship_date, shipping_date, request_date, due_date,
     internal_contact, supplier_contact, memo, reference_project_id, default_language, status,
     created_by, created_by_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`).run(
    id, businessId, reportType, body.titleOverride ?? null, body.projectName,
    body.internalRefNo ?? null, body.customerName ?? null, body.supplierName ?? null, body.manufacturerName ?? null,
    body.productCategory ?? null, body.productName ?? null, body.baseModelName ?? null,
    body.poNumber ?? null, body.piNumber ?? null, body.productionLotNo ?? null,
    body.productionQty ?? null, body.inspectionQty ?? null,
    body.shipDate ?? null, body.shippingDate ?? null, body.requestDate ?? null, body.dueDate ?? null,
    body.internalContact ?? null, body.supplierContact ?? null, body.memo ?? null,
    body.referenceProjectId ?? null, body.defaultLanguage || 'zh',
    user.id, user.name, ts, ts,
  );

  writeInspectionAuditLog({ projectId: id, action: 'project_create', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: body, req });

  if (referenceProject) {
    const { productCount } = snapshotProjectData(referenceProject.id, id);
    writeInspectionAuditLog({
      projectId: id, action: 'snapshot_create', actorType: 'internal', actorUserId: user.id, actorUserName: user.name,
      after: { sourceProjectId: referenceProject.id, productCount }, req,
    });
  }

  const row = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}
