import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardApprovalDocRequest, hashToken } from '@/lib/approval-doc/token';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, division: row.division, sortOrder: row.sort_order, inspectionItem: row.inspection_item, unit: row.unit,
    specValueOriginal: row.spec_value_original, specValueKorean: row.spec_value_korean,
    minValueOriginal: row.min_value_original, minValueKorean: row.min_value_korean,
    maxValueOriginal: row.max_value_original, maxValueKorean: row.max_value_korean,
    isReferenceOnly: !!row.is_reference_only,
    measuredValueOriginal: row.measured_value_original, measuredValueKorean: row.measured_value_korean,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_doc_general_spec_items WHERE project_id=? ORDER BY sort_order').all(guard.project.id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

interface SpecRowInput {
  id?: string; division?: string | null; sortOrder: number; inspectionItem: string; unit?: string | null;
  specValueOriginal?: string | null; minValueOriginal?: string | null; maxValueOriginal?: string | null;
  isReferenceOnly?: boolean;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const projectId = guard.project.id;

  // 일반사양 표는 항상 특정 섹션 인스턴스(section_type='general_spec')에 종속된다.
  const section = db.prepare(`SELECT id FROM approval_doc_sections WHERE project_id=? AND section_type='general_spec'`).get(projectId) as { id: string } | undefined;
  if (!section) return NextResponse.json({ error: '이 프로젝트에는 일반사양 섹션이 없습니다.' }, { status: 400 });

  const body = await req.json();
  const items: SpecRowInput[] = Array.isArray(body.rows) ? body.rows : [];

  const ts = now();
  db.transaction(() => {
    db.prepare('DELETE FROM approval_doc_general_spec_items WHERE project_id=?').run(projectId);
    const insert = db.prepare(`INSERT INTO approval_doc_general_spec_items
      (id, project_id, section_id, division, sort_order, inspection_item, unit,
       spec_value_original, spec_value_korean, min_value_original, min_value_korean,
       max_value_original, max_value_korean, is_reference_only, measured_value_original, measured_value_korean,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, NULL, ?, NULL, NULL, ?, ?)`);
    items.forEach((it, idx) => {
      insert.run(
        it.id || newId(), projectId, section.id, it.division ?? null, idx, it.inspectionItem, it.unit ?? null,
        it.specValueOriginal ?? null, it.minValueOriginal ?? null, it.maxValueOriginal ?? null,
        it.isReferenceOnly ? 1 : 0, ts, ts,
      );
    });
    db.prepare('UPDATE approval_doc_projects SET updated_at=? WHERE id=?').run(ts, projectId);
  })();

  writeApprovalAuditLog({
    projectId, action: 'draft_save', actorType: 'external', actorTokenHash: hashToken(token),
    after: { section: 'general_spec', rowCount: items.length }, req,
  });

  const rows = db.prepare('SELECT * FROM approval_doc_general_spec_items WHERE project_id=? ORDER BY sort_order').all(projectId) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}
