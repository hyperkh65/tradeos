import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { guardApprovalDocRequest, hashToken } from '@/lib/approval-doc/token';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { SCALAR_SECTION_FIELDS } from '@/lib/approval-doc/table-sections';
import type { BuiltinSectionType } from '@/lib/approval-doc/types';

/** product_overview 등 "단순 텍스트 필드만 있는 섹션"의 값을 approval_doc_sections.data_json에
 * {key: string}[단순 문자열, 원문 그대로 보존] 형태로 저장한다. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string }> }) {
  const { token, sectionId } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const row = db.prepare('SELECT section_type, data_json FROM approval_doc_sections WHERE id=? AND project_id=?').get(sectionId, guard.project.id) as { section_type: string; data_json: string } | undefined;
  if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });
  const fields = SCALAR_SECTION_FIELDS[row.section_type as BuiltinSectionType];
  if (!fields) return NextResponse.json({ error: '지원하지 않는 섹션입니다.' }, { status: 400 });
  return NextResponse.json({ data: JSON.parse(row.data_json || '{}') });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string }> }) {
  const { token, sectionId } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const row = db.prepare('SELECT section_type FROM approval_doc_sections WHERE id=? AND project_id=?').get(sectionId, guard.project.id) as { section_type: string } | undefined;
  if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });
  const fields = SCALAR_SECTION_FIELDS[row.section_type as BuiltinSectionType];
  if (!fields) return NextResponse.json({ error: '지원하지 않는 섹션입니다.' }, { status: 400 });

  const body = await req.json();
  const values: Record<string, string> = {};
  for (const f of fields) {
    if (typeof body[f.key] === 'string') values[f.key] = body[f.key];
  }

  const ts = now();
  db.prepare('UPDATE approval_doc_sections SET data_json=?, updated_at=? WHERE id=?').run(JSON.stringify(values), ts, sectionId);
  db.prepare('UPDATE approval_doc_projects SET updated_at=? WHERE id=?').run(ts, guard.project.id);

  writeApprovalAuditLog({ projectId: guard.project.id, action: 'draft_save', actorType: 'external', actorTokenHash: hashToken(token), after: { sectionId, fieldCount: Object.keys(values).length }, req });

  return NextResponse.json({ data: values });
}
