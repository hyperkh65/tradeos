import { getDb } from '@/lib/db/sqlite';
import { SECTION_DEFINITIONS, getSectionDefinition } from './section-registry';
import { TABLE_SECTION_CONFIG, ATTACHMENT_SECTION_CATEGORIES, SCALAR_SECTION_FIELDS } from './table-sections';
import type { BuiltinSectionType } from './types';

export interface ValidationIssue {
  /** 프로젝트 안에서 유일한 키 — approval_doc_validation_acknowledgements.issue_key와 매칭돼
   * "이 특정 불일치를 확인/승인했는지"를 추적한다. */
  key: string;
  severity: 'blocking' | 'warning';
  sectionType?: string;
  message: string;
}

/** 표/첨부/스칼라 어떤 형태든 "이 섹션에 실제 입력된 내용이 있는가"를 판별한다.
 * required 섹션이 비어있으면 제출/생성을 막기 위한 공용 체크. */
function sectionHasContent(db: ReturnType<typeof getDb>, projectId: string, sectionId: string, sectionType: BuiltinSectionType): boolean {
  if (sectionType === 'revision_history') {
    return (db.prepare('SELECT COUNT(*) as c FROM approval_doc_revision_history WHERE project_id=?').get(projectId) as { c: number }).c > 0;
  }
  if (sectionType === 'general_spec') {
    return (db.prepare('SELECT COUNT(*) as c FROM approval_doc_general_spec_items WHERE section_id=?').get(sectionId) as { c: number }).c > 0;
  }
  const tableConfig = TABLE_SECTION_CONFIG[sectionType];
  if (tableConfig) {
    const conds = ['section_id=?'];
    const values: unknown[] = [sectionId];
    if (tableConfig.fixedValues) for (const [col, val] of Object.entries(tableConfig.fixedValues)) { conds.push(`${col}=?`); values.push(val); }
    const deletedFilter = tableConfig.dbTable === 'approval_doc_component_items' ? ' AND deleted=0' : '';
    return (db.prepare(`SELECT COUNT(*) as c FROM ${tableConfig.dbTable} WHERE ${conds.join(' AND ')}${deletedFilter}`).get(...values) as { c: number }).c > 0;
  }
  if (ATTACHMENT_SECTION_CATEGORIES[sectionType]) {
    return (db.prepare('SELECT COUNT(*) as c FROM approval_doc_attachments WHERE section_id=? AND is_current=1').get(sectionId) as { c: number }).c > 0;
  }
  if (SCALAR_SECTION_FIELDS[sectionType]) {
    const row = db.prepare('SELECT data_json FROM approval_doc_sections WHERE id=?').get(sectionId) as { data_json: string } | undefined;
    const values = JSON.parse(row?.data_json || '{}') as Record<string, string>;
    return Object.values(values).some(v => v?.trim());
  }
  return true; // 커스텀 섹션 등은 판별 기준이 없으므로 통과시킨다(내용 없음 경고를 강제하지 않음)
}

/** 자유텍스트 항목명(inspection_item)에서 광속/전력/효율 값을 대략 찾아 광효율 계산을
 * 대조한다 — 필드가 고정 스키마가 아니라 사용자가 이름 붙이는 표라 완전한 일치를 보장할
 * 수 없으므로 키워드 기반 근사 매칭이며, 못 찾으면 조용히 건너뛴다(오탐 방지 우선). */
function checkLuminousEfficacy(db: ReturnType<typeof getDb>, projectId: string, sectionId: string): ValidationIssue | null {
  const rows = db.prepare('SELECT inspection_item, spec_value_original, unit FROM approval_doc_general_spec_items WHERE section_id=?').all(sectionId) as { inspection_item: string; spec_value_original: string | null; unit: string | null }[];
  const findNum = (keywords: string[]) => {
    const row = rows.find(r => keywords.some(k => r.inspection_item?.toLowerCase().includes(k)));
    const n = row ? parseFloat((row.spec_value_original || '').replace(/[^0-9.]/g, '')) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const flux = findNum(['광속', 'flux', 'lumen']);
  const power = findNum(['전력', 'power', 'watt']);
  const efficacy = findNum(['광효율', 'efficacy', 'efficiency', 'lm/w']);
  if (flux == null || power == null || efficacy == null || power === 0) return null;

  const computed = flux / power;
  const diffRatio = Math.abs(computed - efficacy) / efficacy;
  if (diffRatio > 0.05) { // 5% 초과 오차만 플래그(반올림/측정 오차 허용)
    return {
      key: `${projectId}:efficacy_mismatch`, severity: 'warning', sectionType: 'general_spec',
      message: `광효율 불일치: 광속(${flux})÷전력(${power})=${computed.toFixed(1)}lm/W인데, 기재된 광효율은 ${efficacy}lm/W입니다.`,
    };
  }
  return null;
}

export function validateProject(projectId: string): ValidationIssue[] {
  const db = getDb();
  const issues: ValidationIssue[] = [];

  const sections = db.prepare('SELECT id, section_type, included FROM approval_doc_sections WHERE project_id=?').all(projectId) as { id: string; section_type: string; included: number }[];

  for (const s of sections) {
    if (!s.included) continue;
    const def = getSectionDefinition(s.section_type as BuiltinSectionType);
    if (!def) continue; // 커스텀 섹션
    const hasContent = sectionHasContent(db, projectId, s.id, s.section_type as BuiltinSectionType);
    if (!hasContent) {
      if (def.requirement === 'required') {
        issues.push({ key: `${projectId}:${s.id}:empty`, severity: 'blocking', sectionType: s.section_type, message: `필수 섹션 "${def.title.ko}"에 입력된 내용이 없습니다.` });
      } else if (def.requirement === 'recommended') {
        issues.push({ key: `${projectId}:${s.id}:empty`, severity: 'warning', sectionType: s.section_type, message: `권장 섹션 "${def.title.ko}"에 입력된 내용이 없습니다.` });
      }
    }

    if (s.section_type === 'general_spec' && hasContent) {
      const eff = checkLuminousEfficacy(db, projectId, s.id);
      if (eff) issues.push(eff);
    }
  }

  // 출하검사/평가시험/신뢰성시험: 기준값·측정값이 모두 있는데 합격여부가 비어있으면 경고
  const testRows = db.prepare(`
    SELECT ti.id, ti.item_label, s.section_type FROM approval_doc_test_items ti
    JOIN approval_doc_sections s ON s.id = ti.section_id
    WHERE ti.project_id=? AND (ti.pass_fail IS NULL OR ti.pass_fail='')
      AND ti.spec_value_original IS NOT NULL AND ti.spec_value_original != ''
      AND ti.measured_value_original IS NOT NULL AND ti.measured_value_original != ''
  `).all(projectId) as { id: string; item_label: string; section_type: string }[];
  for (const r of testRows) {
    issues.push({
      key: `${projectId}:test:${r.id}:no_pass_fail`, severity: 'warning', sectionType: r.section_type,
      message: `"${r.item_label || '시험 항목'}"에 기준값·측정값은 있지만 합격/불합격이 기재되지 않았습니다.`,
    });
  }

  return issues;
}

/** true면(=차단 이슈 없음, 또는 전부 확인됨) 제출/생성 진행 가능 */
export function hasUnacknowledgedBlockingIssues(projectId: string): { blocked: boolean; issues: ValidationIssue[] } {
  const db = getDb();
  const issues = validateProject(projectId);
  const blocking = issues.filter(i => i.severity === 'blocking');
  if (blocking.length === 0) return { blocked: false, issues };
  const acked = new Set((db.prepare('SELECT issue_key FROM approval_doc_validation_acknowledgements WHERE project_id=?').all(projectId) as { issue_key: string }[]).map(r => r.issue_key));
  const unacked = blocking.filter(i => !acked.has(i.key));
  return { blocked: unacked.length > 0, issues };
}

// SECTION_DEFINITIONS를 다시 export해 라우트에서 이 파일 하나만 임포트해도 되게 한다.
export { SECTION_DEFINITIONS };
