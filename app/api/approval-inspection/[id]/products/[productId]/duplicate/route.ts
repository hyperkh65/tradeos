import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

/** 제품 복제(§5) — 측정항목/배선정보까지 값 그대로 복사한다(사진은 복사하지 않음,
 * 새 모델은 실제 촬영이 필요하므로 가짜로 재사용하지 않는다). newModelName을 주면
 * "모델명만 변경하여 복제"(§5) — 나머지 필드는 원본 그대로 두고 모델명만 바꿔서
 * 저장하므로, 화면에서 복제 직후 모델명 입력창에 포커스를 주는 방식으로 구현하면 된다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });
  const source = db.prepare('SELECT * FROM approval_inspection_products WHERE id=? AND project_id=? AND deleted=0').get(productId, id) as Record<string, unknown> | undefined;
  if (!source) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const newModelName = typeof body.newModelName === 'string' && body.newModelName.trim() ? body.newModelName.trim() : source.model_name;

  const ts = now();
  const newProductId = newId();
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_inspection_products WHERE project_id=? AND deleted=0').get(id) as { m: number | null }).m;

  db.transaction(() => {
    db.prepare(`INSERT INTO approval_inspection_products
      (id, project_id, sort_order, product_category, product_name, model_name, manufacturer, production_lot,
       dimensions, weight_g, cert_number, remark, overall_judgement, internal_opinion, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`).run(
      newProductId, id, (maxOrder ?? -1) + 1, source.product_category, source.product_name, newModelName,
      source.manufacturer, source.production_lot, source.dimensions, source.weight_g, source.cert_number, source.remark,
      ts, ts,
    );

    const measurements = db.prepare('SELECT * FROM approval_inspection_measurements WHERE product_id=?').all(productId) as Record<string, unknown>[];
    const insertMeasurement = db.prepare(`INSERT INTO approval_inspection_measurements
      (id, project_id, product_id, item_key, item_label, baseline_value, baseline_unit, measured_value, measured_unit,
       min_value, max_value, tolerance, equipment, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`);
    measurements.forEach(m => insertMeasurement.run(
      newId(), id, newProductId, m.item_key, m.item_label, m.baseline_value, m.baseline_unit, m.measured_unit,
      m.min_value, m.max_value, m.tolerance, m.equipment, m.sort_order, ts, ts,
    ));

    const wires = db.prepare('SELECT * FROM approval_inspection_wire_specs WHERE product_id=?').all(productId) as Record<string, unknown>[];
    const insertWire = db.prepare(`INSERT INTO approval_inspection_wire_specs
      (id, project_id, product_id, wire_role, wire_spec, conductor_area, core_count, insulation_material, color,
       baseline_length_value, baseline_length_unit, measured_length_unit, strip_length, end_treatment,
       connector_manufacturer, connector_model, pin_count, polarity, remark, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    wires.forEach(w => insertWire.run(
      newId(), id, newProductId, w.wire_role, w.wire_spec, w.conductor_area, w.core_count, w.insulation_material, w.color,
      w.baseline_length_value, w.baseline_length_unit, w.measured_length_unit, w.strip_length, w.end_treatment,
      w.connector_manufacturer, w.connector_model, w.pin_count, w.polarity, w.remark, w.sort_order, ts, ts,
    ));
  })();

  writeInspectionAuditLog({ projectId: id, action: 'product_duplicate', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before: { sourceProductId: productId }, after: { newProductId, newModelName }, req });

  const row = db.prepare('SELECT * FROM approval_inspection_products WHERE id=?').get(newProductId) as Record<string, unknown>;
  return NextResponse.json({ data: {
    id: row.id, projectId: row.project_id, sortOrder: row.sort_order,
    productCategory: row.product_category, productName: row.product_name, modelName: row.model_name,
    manufacturer: row.manufacturer, productionLot: row.production_lot,
    dimensions: row.dimensions, weightG: row.weight_g, certNumber: row.cert_number, remark: row.remark,
  } }, { status: 201 });
}
