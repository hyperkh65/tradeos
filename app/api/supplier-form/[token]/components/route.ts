import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardSupplierRequest } from '@/lib/supplier-form/token';
import { writeAuditLog } from '@/lib/supplier-form/audit';

const VALID_LIST_TYPES = new Set(['fixture_part', 'converter_part', 'multi_component']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardSupplierRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const body = await req.json().catch(() => null);
  if (!body || !VALID_LIST_TYPES.has(body.listType)) {
    return NextResponse.json({ error: '잘못된 목록 종류입니다.' }, { status: 400 });
  }

  const db = getDb();
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM supplier_component_items WHERE project_id=? AND list_type=? AND deleted=0')
    .get(project.id, body.listType) as { m: number | null };

  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO supplier_component_items
    (id, project_id, list_type, row_key, sort_order, part_name, model_name, spec_text, material,
     width_mm, depth_mm, height_mm, qty, manufacturer, remark, original_json, korean_json, deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', 0, ?, ?)`).run(
    id, project.id, body.listType, body.rowKey ?? null, (maxOrder.m ?? -1) + 1,
    body.partName ?? null, body.modelName ?? null, body.specText ?? null, body.material ?? null,
    body.widthMm ?? null, body.depthMm ?? null, body.heightMm ?? null, body.qty ?? null,
    body.manufacturer ?? null, body.remark ?? null, ts, ts,
  );

  writeAuditLog({ projectId: project.id, action: 'draft_save', actorType: 'external', req, after: { addedComponent: body.listType } });
  const row = db.prepare('SELECT * FROM supplier_component_items WHERE id=?').get(id);
  return NextResponse.json({ data: row }, { status: 201 });
}
