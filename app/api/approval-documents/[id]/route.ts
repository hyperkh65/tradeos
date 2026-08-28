import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id,
    productName: row.product_name, modelName: row.model_name,
    docType: row.doc_type, revision: row.revision,
    customerName: row.customer_name, supplierName: row.supplier_name, contactPerson: row.contact_person,
    internalRefNo: row.internal_ref_no, productCategory: row.product_category,
    hasConverter: row.has_converter == null ? null : !!row.has_converter,
    templateId: row.template_id, brandProfileId: row.brand_profile_id,
    defaultLanguage: row.default_language, finalLanguage: row.final_language,
    status: row.status, dueDate: row.due_date, memo: row.memo,
    createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });
  return NextResponse.json({ data: toClient(row) });
}

const EDITABLE_FIELDS: Record<string, string> = {
  productName: 'product_name', modelName: 'model_name', docType: 'doc_type', revision: 'revision',
  customerName: 'customer_name', supplierName: 'supplier_name', contactPerson: 'contact_person',
  internalRefNo: 'internal_ref_no', productCategory: 'product_category',
  templateId: 'template_id', brandProfileId: 'brand_profile_id',
  defaultLanguage: 'default_language', finalLanguage: 'final_language',
  dueDate: 'due_date', memo: 'memo',
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const before = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (before.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다. 먼저 마감을 해제하세요.' }, { status: 423 });

  const body = await req.json();
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) { sets.push(`${col}=?`); values.push(body[key] ?? null); }
  }
  if ('hasConverter' in body) { sets.push('has_converter=?'); values.push(body.hasConverter == null ? null : (body.hasConverter ? 1 : 0)); }
  if (sets.length === 0) return NextResponse.json({ error: '변경할 값이 없습니다.' }, { status: 400 });

  sets.push('updated_at=?');
  values.push(now());
  values.push(id);
  db.prepare(`UPDATE approval_doc_projects SET ${sets.join(', ')} WHERE id=?`).run(...values);

  writeApprovalAuditLog({ projectId: id, action: 'project_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, after: body, req });

  const row = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) });
}
