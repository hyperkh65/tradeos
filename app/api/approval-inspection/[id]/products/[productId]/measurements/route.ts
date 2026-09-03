import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, productId: row.product_id,
    itemKey: row.item_key, itemLabel: row.item_label,
    baselineValue: row.baseline_value, baselineUnit: row.baseline_unit,
    measuredValue: row.measured_value, measuredUnit: row.measured_unit,
    minValue: row.min_value, maxValue: row.max_value, tolerance: row.tolerance,
    equipment: row.equipment, measuredDate: row.measured_date, measuredBy: row.measured_by,
    judgement: row.judgement, remark: row.remark, sortOrder: row.sort_order,
  };
}

async function assertEditable(db: ReturnType<typeof getDb>, projectId: string, productId: string) {
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(projectId) as { status: string } | undefined;
  if (!project) return { error: NextResponse.json({ error: '없음' }, { status: 404 }) };
  if (project.status === 'closed') return { error: NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 }) };
  const product = db.prepare('SELECT id FROM approval_inspection_products WHERE id=? AND project_id=? AND deleted=0').get(productId, projectId);
  if (!product) return { error: NextResponse.json({ error: '없음' }, { status: 404 }) };
  return { error: null };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  const rows = db.prepare('SELECT * FROM approval_inspection_measurements WHERE product_id=? AND project_id=? ORDER BY sort_order').all(productId, id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

/** §7 "사용자가 자유롭게 항목을 추가할 수 있다"에 대응 — 표준 세트 외의 커스텀
 * 측정항목 행을 하나 추가한다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const gate = await assertEditable(db, id, productId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  if (!body.itemLabel?.trim()) return NextResponse.json({ error: '측정항목명은 필수입니다.' }, { status: 400 });
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_inspection_measurements WHERE product_id=?').get(productId) as { m: number | null }).m;
  const ts = now();
  const measurementId = newId();
  db.prepare(`INSERT INTO approval_inspection_measurements
    (id, project_id, product_id, item_key, item_label, baseline_value, baseline_unit, measured_value, measured_unit,
     min_value, max_value, tolerance, equipment, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    measurementId, id, productId, body.itemKey || `custom_${measurementId.slice(0, 8)}`, body.itemLabel.trim(),
    body.baselineValue ?? null, body.baselineUnit ?? null, body.measuredValue ?? null, body.measuredUnit ?? null,
    body.minValue ?? null, body.maxValue ?? null, body.tolerance ?? null, body.equipment ?? null,
    (maxOrder ?? -1) + 1, ts, ts,
  );

  writeInspectionAuditLog({ projectId: id, action: 'measurement_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: body, req });
  const row = db.prepare('SELECT * FROM approval_inspection_measurements WHERE id=?').get(measurementId) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}

/** 표 전체를 한 번에 저장(값 입력 화면에서 여러 행을 편집 후 일괄 저장). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const gate = await assertEditable(db, id, productId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const rows: Array<Record<string, unknown>> = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: 'rows 배열이 필요합니다.' }, { status: 400 });

  const EDITABLE_FIELDS: Record<string, string> = {
    itemLabel: 'item_label', baselineValue: 'baseline_value', baselineUnit: 'baseline_unit',
    measuredValue: 'measured_value', measuredUnit: 'measured_unit',
    minValue: 'min_value', maxValue: 'max_value', tolerance: 'tolerance',
    equipment: 'equipment', measuredDate: 'measured_date', measuredBy: 'measured_by',
    judgement: 'judgement', remark: 'remark',
  };
  const ts = now();
  db.transaction(() => {
    for (const r of rows) {
      if (typeof r.id !== 'string') continue;
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, col] of Object.entries(EDITABLE_FIELDS)) {
        if (key in r) { sets.push(`${col}=?`); values.push(r[key] ?? null); }
      }
      if (sets.length === 0) continue;
      sets.push('updated_at=?'); values.push(ts); values.push(r.id); values.push(productId);
      db.prepare(`UPDATE approval_inspection_measurements SET ${sets.join(', ')} WHERE id=? AND product_id=?`).run(...values);
    }
  })();

  writeInspectionAuditLog({ projectId: id, action: 'measurement_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: { count: rows.length }, req });
  const out = db.prepare('SELECT * FROM approval_inspection_measurements WHERE product_id=? ORDER BY sort_order').all(productId) as Record<string, unknown>[];
  return NextResponse.json({ data: out.map(toClient) });
}
