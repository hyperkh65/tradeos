import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  const guard = guardInspectionFormRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_inspection_measurements WHERE product_id=? AND project_id=? ORDER BY sort_order').all(productId, guard.project.id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();
  const product = db.prepare('SELECT id FROM approval_inspection_products WHERE id=? AND project_id=? AND deleted=0').get(productId, project.id);
  if (!product) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.itemLabel?.trim()) return NextResponse.json({ error: '측정항목명은 필수입니다.' }, { status: 400 });
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_inspection_measurements WHERE product_id=?').get(productId) as { m: number | null }).m;
  const ts = now();
  const measurementId = newId();
  db.prepare(`INSERT INTO approval_inspection_measurements
    (id, project_id, product_id, item_key, item_label, baseline_value, baseline_unit, measured_value, measured_unit,
     min_value, max_value, tolerance, equipment, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    measurementId, project.id, productId, body.itemKey || `custom_${measurementId.slice(0, 8)}`, body.itemLabel.trim(),
    body.baselineValue ?? null, body.baselineUnit ?? null, body.measuredValue ?? null, body.measuredUnit ?? null,
    body.minValue ?? null, body.maxValue ?? null, body.tolerance ?? null, body.equipment ?? null,
    (maxOrder ?? -1) + 1, ts, ts,
  );

  writeInspectionAuditLog({ projectId: project.id, action: 'measurement_update', actorType: 'external', actorTokenHash: hashToken(token), after: body, req });
  const row = db.prepare('SELECT * FROM approval_inspection_measurements WHERE id=?').get(measurementId) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();

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

  writeInspectionAuditLog({ projectId: project.id, action: 'measurement_update', actorType: 'external', actorTokenHash: hashToken(token), after: { count: rows.length }, req });
  const out = db.prepare('SELECT * FROM approval_inspection_measurements WHERE product_id=? ORDER BY sort_order').all(productId) as Record<string, unknown>[];
  return NextResponse.json({ data: out.map(toClient) });
}
