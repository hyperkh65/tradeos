import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, productId: row.product_id, wireRole: row.wire_role,
    wireSpec: row.wire_spec, conductorArea: row.conductor_area, coreCount: row.core_count,
    insulationMaterial: row.insulation_material, color: row.color,
    baselineLengthValue: row.baseline_length_value, baselineLengthUnit: row.baseline_length_unit,
    measuredLengthValue: row.measured_length_value, measuredLengthUnit: row.measured_length_unit,
    stripLength: row.strip_length, endTreatment: row.end_treatment,
    connectorManufacturer: row.connector_manufacturer, connectorModel: row.connector_model,
    pinCount: row.pin_count, polarity: row.polarity, remark: row.remark, sortOrder: row.sort_order,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  const guard = guardInspectionFormRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_inspection_wire_specs WHERE product_id=? AND project_id=? ORDER BY wire_role, sort_order').all(productId, guard.project.id) as Record<string, unknown>[];
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
  const wireRole = body.wireRole === 'output' ? 'output' : 'input';
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_inspection_wire_specs WHERE product_id=? AND wire_role=?').get(productId, wireRole) as { m: number | null }).m;
  const ts = now();
  const wireId = newId();
  db.prepare(`INSERT INTO approval_inspection_wire_specs
    (id, project_id, product_id, wire_role, wire_spec, conductor_area, core_count, insulation_material, color,
     baseline_length_value, baseline_length_unit, measured_length_value, measured_length_unit, strip_length, end_treatment,
     connector_manufacturer, connector_model, pin_count, polarity, remark, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    wireId, project.id, productId, wireRole, body.wireSpec ?? null, body.conductorArea ?? null, body.coreCount ?? null,
    body.insulationMaterial ?? null, body.color ?? null,
    body.baselineLengthValue ?? null, body.baselineLengthUnit || 'mm', body.measuredLengthValue ?? null, body.measuredLengthUnit || 'mm',
    body.stripLength ?? null, body.endTreatment ?? null, body.connectorManufacturer ?? null, body.connectorModel ?? null,
    body.pinCount ?? null, body.polarity ?? null, body.remark ?? null, (maxOrder ?? -1) + 1, ts, ts,
  );

  writeInspectionAuditLog({ projectId: project.id, action: 'wire_spec_update', actorType: 'external', actorTokenHash: hashToken(token), after: body, req });
  const row = db.prepare('SELECT * FROM approval_inspection_wire_specs WHERE id=?').get(wireId) as Record<string, unknown>;
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
    wireSpec: 'wire_spec', conductorArea: 'conductor_area', coreCount: 'core_count',
    insulationMaterial: 'insulation_material', color: 'color',
    baselineLengthValue: 'baseline_length_value', baselineLengthUnit: 'baseline_length_unit',
    measuredLengthValue: 'measured_length_value', measuredLengthUnit: 'measured_length_unit',
    stripLength: 'strip_length', endTreatment: 'end_treatment',
    connectorManufacturer: 'connector_manufacturer', connectorModel: 'connector_model',
    pinCount: 'pin_count', polarity: 'polarity', remark: 'remark',
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
      db.prepare(`UPDATE approval_inspection_wire_specs SET ${sets.join(', ')} WHERE id=? AND product_id=?`).run(...values);
    }
  })();

  writeInspectionAuditLog({ projectId: project.id, action: 'wire_spec_update', actorType: 'external', actorTokenHash: hashToken(token), after: { count: rows.length }, req });
  const out = db.prepare('SELECT * FROM approval_inspection_wire_specs WHERE product_id=? ORDER BY wire_role, sort_order').all(productId) as Record<string, unknown>[];
  return NextResponse.json({ data: out.map(toClient) });
}
