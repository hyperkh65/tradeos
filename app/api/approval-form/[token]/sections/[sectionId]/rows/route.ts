import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardApprovalDocRequest, hashToken } from '@/lib/approval-doc/token';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { TABLE_SECTION_CONFIG } from '@/lib/approval-doc/table-sections';
import type { BuiltinSectionType } from '@/lib/approval-doc/types';

/**
 * "표 형태 섹션"(치수/포장/시험/인증/부품표 등) 전부를 처리하는 제네릭 라우트 —
 * lib/approval-doc/table-sections.ts의 TABLE_SECTION_CONFIG가 section_type→DB테이블+컬럼을
 * 정의해두면 이 라우트 하나로 모든 표 섹션의 조회/저장을 처리한다(섹션마다 라우트를
 * 새로 만들지 않기 위한 설계 — revision-history/general-spec은 먼저 만들어져 있던 전용
 * 라우트를 그대로 둔다).
 */
async function resolveSection(projectId: string, sectionId: string) {
  const db = getDb();
  const section = db.prepare('SELECT id, section_type FROM approval_doc_sections WHERE id=? AND project_id=?').get(sectionId, projectId) as { id: string; section_type: string } | undefined;
  if (!section) return null;
  const config = TABLE_SECTION_CONFIG[section.section_type as BuiltinSectionType];
  if (!config) return null;
  return { section, config };
}

function whereClause(config: NonNullable<Awaited<ReturnType<typeof resolveSection>>>['config'], projectId: string, sectionId: string) {
  const conds = ['project_id=?', 'section_id=?'];
  const values: unknown[] = [projectId, sectionId];
  if (config.fixedValues) {
    for (const [col, val] of Object.entries(config.fixedValues)) { conds.push(`${col}=?`); values.push(val); }
  }
  return { sql: conds.join(' AND '), values };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string }> }) {
  const { token, sectionId } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const resolved = await resolveSection(guard.project.id, sectionId);
  if (!resolved) return NextResponse.json({ error: '지원하지 않는 섹션입니다.' }, { status: 400 });
  const { config } = resolved;

  const db = getDb();
  const { sql, values } = whereClause(config, guard.project.id, sectionId);
  const deletedFilter = config.dbTable === 'approval_doc_component_items' ? ' AND deleted=0' : '';
  const rows = db.prepare(`SELECT * FROM ${config.dbTable} WHERE ${sql}${deletedFilter} ORDER BY sort_order`).all(...values) as Record<string, unknown>[];

  const cols = ['id', 'sort_order', ...config.columns.map(c => c.key)];
  return NextResponse.json({ data: rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]]))) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string }> }) {
  const { token, sectionId } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const resolved = await resolveSection(guard.project.id, sectionId);
  if (!resolved) return NextResponse.json({ error: '지원하지 않는 섹션입니다.' }, { status: 400 });
  const { config } = resolved;

  const body = await req.json();
  const items: Record<string, unknown>[] = Array.isArray(body.rows) ? body.rows : [];

  const db = getDb();
  const projectId = guard.project.id;
  const ts = now();
  const { sql: whereSql, values: whereValues } = whereClause(config, projectId, sectionId);

  const insertCols = ['id', 'project_id', 'section_id', 'sort_order', ...Object.keys(config.fixedValues || {}), ...config.columns.map(c => c.key)];
  // component_items 테이블은 이 라우트가 채우지 않는 NOT NULL 계열 컬럼이 없어 그대로 재사용 가능.
  const extraCols = config.dbTable === 'approval_doc_component_items' ? ['original_json', 'korean_json', 'deleted', 'created_at', 'updated_at'] : ['created_at', 'updated_at'];
  const allCols = [...insertCols, ...extraCols];
  const placeholders = allCols.map(() => '?').join(',');
  const insert = db.prepare(`INSERT INTO ${config.dbTable} (${allCols.join(',')}) VALUES (${placeholders})`);

  db.transaction(() => {
    db.prepare(`DELETE FROM ${config.dbTable} WHERE ${whereSql}`).run(...whereValues);
    items.forEach((item, idx) => {
      const values: unknown[] = [
        newId(), projectId, sectionId, idx,
        ...Object.values(config.fixedValues || {}),
        ...config.columns.map(c => item[c.key] ?? null),
      ];
      if (config.dbTable === 'approval_doc_component_items') values.push('{}', '{}', 0, ts, ts);
      else values.push(ts, ts);
      insert.run(...values);
    });
    db.prepare('UPDATE approval_doc_projects SET updated_at=? WHERE id=?').run(ts, projectId);
  })();

  writeApprovalAuditLog({
    projectId, action: 'draft_save', actorType: 'external', actorTokenHash: hashToken(token),
    after: { sectionId, rowCount: items.length }, req,
  });

  const deletedFilter = config.dbTable === 'approval_doc_component_items' ? ' AND deleted=0' : '';
  const rows = db.prepare(`SELECT * FROM ${config.dbTable} WHERE ${whereSql}${deletedFilter} ORDER BY sort_order`).all(...whereValues) as Record<string, unknown>[];
  const cols = ['id', 'sort_order', ...config.columns.map(c => c.key)];
  return NextResponse.json({ data: rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]]))) });
}
