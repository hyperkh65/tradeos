import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { SECTION_DEFINITIONS, resolveDefaultIncluded } from '@/lib/approval-doc/section-registry';

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

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_doc_projects ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json();
  if (!body.productName?.trim() || !body.modelName?.trim()) {
    return NextResponse.json({ error: '제품명과 기본 모델명은 필수입니다.' }, { status: 400 });
  }
  const docType = ['approval', 'spec', 'both'].includes(body.docType) ? body.docType : 'approval';

  const db = getDb();
  const id = newId();
  const businessId = nextBizId('APD');
  const ts = now();

  db.prepare(`INSERT INTO approval_doc_projects
    (id, business_id, product_name, model_name, doc_type, revision, customer_name, supplier_name,
     contact_person, internal_ref_no, product_category, has_converter, template_id, brand_profile_id,
     default_language, final_language, status, due_date, memo, created_by, created_by_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'A', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`).run(
    id, businessId, body.productName, body.modelName, docType,
    body.customerName ?? null, body.supplierName ?? null, body.contactPerson ?? null,
    body.internalRefNo ?? null, body.productCategory ?? null,
    body.hasConverter == null ? null : (body.hasConverter ? 1 : 0),
    body.templateId ?? null, body.brandProfileId ?? null,
    body.defaultLanguage || 'zh', body.finalLanguage || 'ko',
    body.dueDate ?? null, body.memo ?? null,
    user.id, user.name, ts, ts,
  );

  // 제품 분류·컨버터 유무에 따른 기본 권장 섹션을 자동 구성 — 요청서 §2/§7.
  // 사용자는 화면에서 언제든 켜고 끌 수 있으므로 여기서는 기본값만 정한다.
  const insertSection = db.prepare(`INSERT INTO approval_doc_sections
    (id, project_id, section_type, included, sort_order, custom_title, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, '{}', ?, ?)`);
  db.transaction(() => {
    SECTION_DEFINITIONS.forEach((def, idx) => {
      const included = resolveDefaultIncluded(def, { productCategory: body.productCategory, hasConverter: body.hasConverter });
      insertSection.run(newId(), id, def.key, included ? 1 : 0, idx, ts, ts);
    });
  })();

  writeApprovalAuditLog({ projectId: id, action: 'project_create', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: body, req });

  const row = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}
