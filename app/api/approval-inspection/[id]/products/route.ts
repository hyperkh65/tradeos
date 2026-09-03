import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { STANDARD_MEASUREMENT_ITEMS } from '@/lib/approval-inspection/types';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, sortOrder: row.sort_order,
    productCategory: row.product_category, productName: row.product_name, modelName: row.model_name,
    manufacturer: row.manufacturer, productionLot: row.production_lot,
    dimensions: row.dimensions, weightG: row.weight_g, certNumber: row.cert_number, specText: row.spec_text, remark: row.remark,
    overallJudgement: row.overall_judgement, internalOpinion: row.internal_opinion,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  const rows = db.prepare('SELECT * FROM approval_inspection_products WHERE project_id=? AND deleted=0 ORDER BY sort_order').all(id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

/** 제품 하나를 추가한다 — §5 "제품 수를 2개로 고정하지 마라"에 대응해 sort_order를
 * 항상 현재 최대값+1로 자동 계산한다(화면이 매번 넘길 필요 없음). 새 제품에는
 * STANDARD_MEASUREMENT_ITEMS(참고 엑셀 헤더 매핑, §6)로 측정항목 기본 행을 바로
 * 만들어준다 — 사용자는 값만 채우면 되고, 필요없는 항목은 화면에서 삭제하면 된다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });

  const body = await req.json().catch(() => ({}));
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_inspection_products WHERE project_id=? AND deleted=0').get(id) as { m: number | null }).m;
  const sortOrder = (maxOrder ?? -1) + 1;
  const ts = now();
  const productId = newId();

  db.transaction(() => {
    db.prepare(`INSERT INTO approval_inspection_products
      (id, project_id, sort_order, product_category, product_name, model_name, manufacturer, production_lot,
       dimensions, weight_g, cert_number, spec_text, remark, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      productId, id, sortOrder, body.productCategory ?? null, body.productName ?? null, body.modelName ?? null,
      body.manufacturer ?? null, body.productionLot ?? null, body.dimensions ?? null, body.weightG ?? null,
      body.certNumber ?? null, body.specText ?? null, body.remark ?? null, ts, ts,
    );
    const insertMeasurement = db.prepare(`INSERT INTO approval_inspection_measurements
      (id, project_id, product_id, item_key, item_label, baseline_unit, measured_unit, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    STANDARD_MEASUREMENT_ITEMS.forEach((item, idx) => {
      insertMeasurement.run(newId(), id, productId, item.key, item.label, item.unit, item.unit, idx, ts, ts);
    });
  })();

  writeInspectionAuditLog({ projectId: id, action: 'product_create', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: body, req });

  const row = db.prepare('SELECT * FROM approval_inspection_products WHERE id=?').get(productId) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}

/** 여러 제품의 순서를 한 번에 저장한다(드래그앤드롭 순서변경, §5). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });

  const body = await req.json().catch(() => ({}));
  const order: string[] = Array.isArray(body.order) ? body.order : [];
  if (order.length === 0) return NextResponse.json({ error: 'order 배열이 필요합니다.' }, { status: 400 });

  const update = db.prepare('UPDATE approval_inspection_products SET sort_order=?, updated_at=? WHERE id=? AND project_id=?');
  const ts = now();
  db.transaction(() => { order.forEach((productId, idx) => update.run(idx, ts, productId, id)); })();

  writeInspectionAuditLog({ projectId: id, action: 'product_reorder', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: { order }, req });
  const rows = db.prepare('SELECT * FROM approval_inspection_products WHERE project_id=? AND deleted=0 ORDER BY sort_order').all(id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}
