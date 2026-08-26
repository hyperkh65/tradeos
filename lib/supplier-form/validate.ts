import {
  DISPLAY_FIELDS, BASE_MODEL_INFO_FIELDS, ORIGIN_MARKING_SUBFIELDS, LED_ARRAY_SUBFIELDS,
  getVisibleAttachmentCategories, type ConverterType, type TranslatableValue,
} from './field-schema';

export interface ValidationIssue {
  key: string;
  /** 'field' | 'attachment' | 'component' */
  kind: 'field' | 'attachment' | 'component';
  reasonKey: 'required' | 'format' | 'mismatch' | 'no_korean_value';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

interface ComponentItemLike {
  listType: string; rowKey: string | null; modelName: string | null; manufacturer: string | null;
  material: string | null; widthMm: string | null; depthMm: string | null; heightMm: string | null;
}

const NUMBER_WITH_UNIT_RE = /^-?\d+(\.\d+)?\s*[a-zA-Z%/~°]*$/;

export function validateSubmission(
  converterType: ConverterType | null,
  testCategories: string[],
  formData: Record<string, TranslatableValue>,
  componentItems: ComponentItemLike[],
  attachmentCategoryKeysPresent: Set<string>,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const val = (key: string) => formData[key]?.original?.trim() || '';

  // 1) 컨버터 사용 여부 선택 여부
  if (!converterType) issues.push({ key: 'converterType', kind: 'field', reasonKey: 'required' });

  // 2) 표시사항 필수 항목
  for (const f of DISPLAY_FIELDS) {
    if (!f.required) continue;
    if (f.key === 'originMarking') {
      for (const sub of ORIGIN_MARKING_SUBFIELDS) if (!val(sub)) issues.push({ key: sub, kind: 'field', reasonKey: 'required' });
      continue;
    }
    if (f.key === 'ledPackageArrayTotal') {
      for (const sub of LED_ARRAY_SUBFIELDS) if (!val(sub)) issues.push({ key: sub, kind: 'field', reasonKey: 'required' });
      continue;
    }
    if (!val(f.key)) issues.push({ key: f.key, kind: 'field', reasonKey: 'required' });
  }

  // 3) 숫자+단위 형식 검사 (정격전력/전압/전류/광속/광효율)
  for (const f of DISPLAY_FIELDS) {
    if (f.format !== 'number+unit') continue;
    const v = val(f.key);
    if (v && !NUMBER_WITH_UNIT_RE.test(v)) issues.push({ key: f.key, kind: 'field', reasonKey: 'format' });
  }

  // 4) 기본모델 발행기관/발행일/번호 — 파생/변경일 때만 필수
  const needsBaseModelInfo = testCategories.includes('derived') || testCategories.includes('part_change');
  if (needsBaseModelInfo) {
    for (const f of BASE_MODEL_INFO_FIELDS) if (!val(f.key)) issues.push({ key: f.key, kind: 'field', reasonKey: 'required' });
  }

  // 5) LED 배열 직렬×병렬=총수량 일치
  const series = Number(val('ledSeriesCount').replace(/[^0-9.]/g, ''));
  const parallel = Number(val('ledParallelCount').replace(/[^0-9.]/g, ''));
  const total = Number(val('ledTotalCount').replace(/[^0-9.]/g, ''));
  if (series > 0 && parallel > 0 && total > 0 && Math.round(series * parallel) !== Math.round(total)) {
    issues.push({ key: 'ledTotalCount', kind: 'field', reasonKey: 'mismatch' });
  }

  // 6) LED Package 모델명 (부품 리스트의 led_package 행)
  const ledPackageRow = componentItems.find(c => c.listType === 'fixture_part' && c.rowKey === 'led_package');
  if (!ledPackageRow?.modelName?.trim()) issues.push({ key: 'led_package_model_name', kind: 'component', reasonKey: 'required' });

  // 7) 부품 리스트: 내용이 있는 행(형명/명세 중 하나라도 입력됨)은 제조사 필수, detailed 레이아웃 행은 재질+치수 필수
  const detailedRowKeys = new Set(['led_pcb', 'housing', 'diffuser_cover', 'lens', 'heatsink_housing_type', 'heatsink_module_type']);
  for (const c of componentItems) {
    if (c.listType !== 'fixture_part') continue;
    const touched = !!(c.modelName?.trim());
    if (!touched) continue;
    if (!c.manufacturer?.trim()) issues.push({ key: `component_manufacturer_${c.rowKey}`, kind: 'component', reasonKey: 'required' });
    if (c.rowKey && detailedRowKeys.has(c.rowKey)) {
      if (!c.material?.trim()) issues.push({ key: `component_material_${c.rowKey}`, kind: 'component', reasonKey: 'required' });
      if (!c.widthMm?.trim() || !c.depthMm?.trim() || !c.heightMm?.trim()) {
        issues.push({ key: `component_dimensions_${c.rowKey}`, kind: 'component', reasonKey: 'required' });
      }
    }
  }

  // 8) 필수 첨부파일
  if (converterType) {
    for (const cat of getVisibleAttachmentCategories(converterType)) {
      if (cat.required === true && !attachmentCategoryKeysPresent.has(cat.key)) {
        issues.push({ key: cat.key, kind: 'attachment', reasonKey: 'required' });
      }
    }
  }

  // 9) 필수 항목의 한국어 확정값 존재 여부 (preserveOriginal 필드는 save 시점에 원문이 그대로 복사되므로
  //    원문이 있으면 자동으로 충족됨 — 번역이 필요한 자유텍스트 필드가 향후 추가될 경우를 대비한 방어적 검사)
  for (const f of DISPLAY_FIELDS) {
    if (!f.required || f.key === 'originMarking' || f.key === 'ledPackageArrayTotal') continue;
    const entry = formData[f.key];
    if (entry && entry.original && !entry.korean) issues.push({ key: f.key, kind: 'field', reasonKey: 'no_korean_value' });
  }

  return { valid: issues.length === 0, issues };
}
