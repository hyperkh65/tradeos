import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/supplier-form/audit';
import type { Lang } from '@/lib/supplier-form/field-schema';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, productName: row.product_name,
    internalRefNo: row.internal_ref_no, supplierName: row.supplier_name, contactPerson: row.contact_person,
    requestedAt: row.requested_at, dueDate: row.due_date, memo: row.memo,
    defaultLanguage: row.default_language, status: row.status, templateVersion: row.template_version,
    createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM supplier_request_projects ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json();
  if (!body.productName?.trim() || !body.supplierName?.trim()) {
    return NextResponse.json({ error: '제품명과 공급업체명은 필수입니다.' }, { status: 400 });
  }
  const validLangs: Lang[] = ['ko', 'zh', 'en'];
  const defaultLanguage: Lang = validLangs.includes(body.defaultLanguage) ? body.defaultLanguage : 'zh';

  const db = getDb();
  const id = newId();
  const businessId = nextBizId('SRP');
  const ts = now();
  db.prepare(`INSERT INTO supplier_request_projects
    (id, business_id, product_name, internal_ref_no, supplier_name, contact_person, requested_at, due_date, memo,
     default_language, status, template_version, created_by, created_by_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'v1', ?, ?, ?, ?)`).run(
    id, businessId, body.productName, body.internalRefNo ?? null, body.supplierName, body.contactPerson ?? null,
    body.requestedAt ?? null, body.dueDate ?? null, body.memo ?? null, defaultLanguage,
    user.id, user.name, ts, ts,
  );

  // 응답 원본(current working copy) 빈 행 미리 생성
  db.prepare(`INSERT INTO supplier_form_responses (id, project_id, converter_type, data_json, hidden_data_json, version, updated_at)
    VALUES (?, ?, NULL, '{}', '{}', 0, ?)`).run(newId(), id, ts);

  writeAuditLog({ projectId: id, action: 'project_create', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: body, req });

  const row = db.prepare('SELECT * FROM supplier_request_projects WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}
