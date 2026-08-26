import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { guardSupplierRequest } from '@/lib/supplier-form/token';
import { writeAuditLog } from '@/lib/supplier-form/audit';

const BODY_KEY_MAP: Record<string, string> = {
  partName: 'part_name', modelName: 'model_name', specText: 'spec_text', material: 'material',
  widthMm: 'width_mm', depthMm: 'depth_mm', heightMm: 'height_mm', qty: 'qty', manufacturer: 'manufacturer', remark: 'remark',
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string; itemId: string }> }) {
  const { token, itemId } = await params;
  const guard = guardSupplierRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const db = getDb();
  // 토큰이 가리키는 프로젝트 소유 행인지 반드시 재확인 (URL의 itemId 변조로 다른 프로젝트 행 접근 차단)
  const existing = db.prepare('SELECT * FROM supplier_component_items WHERE id=? AND project_id=? AND deleted=0').get(itemId, project.id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: '해당 항목을 찾을 수 없습니다.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [bodyKey, col] of Object.entries(BODY_KEY_MAP)) {
    if (bodyKey in body) { sets.push(`${col}=?`); values.push(body[bodyKey] ?? null); }
  }
  if (sets.length === 0) return NextResponse.json({ data: existing });

  sets.push('updated_at=?');
  values.push(now(), itemId, project.id);
  db.prepare(`UPDATE supplier_component_items SET ${sets.join(', ')} WHERE id=? AND project_id=?`).run(...values);

  writeAuditLog({ projectId: project.id, action: 'draft_save', actorType: 'external', req, before: existing, after: body, relatedAttachmentId: null });
  const updated = db.prepare('SELECT * FROM supplier_component_items WHERE id=?').get(itemId);
  return NextResponse.json({ data: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string; itemId: string }> }) {
  const { token, itemId } = await params;
  const guard = guardSupplierRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const db = getDb();
  const existing = db.prepare('SELECT * FROM supplier_component_items WHERE id=? AND project_id=? AND deleted=0').get(itemId, project.id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: '해당 항목을 찾을 수 없습니다.' }, { status: 404 });

  db.prepare('UPDATE supplier_component_items SET deleted=1, updated_at=? WHERE id=? AND project_id=?').run(now(), itemId, project.id);
  writeAuditLog({ projectId: project.id, action: 'draft_save', actorType: 'external', req, before: existing, after: { deleted: true } });
  return NextResponse.json({ ok: true });
}
