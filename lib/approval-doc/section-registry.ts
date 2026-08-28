import type { BuiltinSectionType, I18nText } from './types';

/**
 * 16개 빌트인 섹션(장) 정의 — 참고 문서(Standard Approval Sheet_211214.docx) 목차 순서와
 * 동일. 이 파일이 섹션 종류의 유일한 정의처(default 제목/기본 포함여부)이며, 내부 구성
 * 화면·채번 로직(numbering.ts)·문서 생성(docx-build.ts) 모두 이 배열을 기준으로 동작한다.
 */
/** 요청서 §7 조건부 섹션 규칙의 4단계 상태 중 문서생성 단계에서 실제로 구분해야 하는 3가지.
 * '해당없음'/'작성완료'/'검토필요'/'제외'는 섹션 인스턴스의 런타임 상태(included, 데이터
 * 유무)로 파생되므로 여기서는 "이 섹션 종류가 원래 얼마나 중요한가"만 고정값으로 둔다. */
export type SectionRequirement = 'required' | 'recommended' | 'optional';

export interface SectionDefinition {
  key: BuiltinSectionType;
  title: I18nText;
  /** 프로젝트 생성 시 기본으로 포함할지 여부 (사용자가 언제든 해제 가능) */
  defaultIncluded: boolean;
  /** required: 포함된 채로 내용이 비어있으면 제출/생성을 막는다.
   *  recommended: 비어있으면 경고만 하고 담당자 확인 후 진행 가능.
   *  optional: 비어있어도 조용히 제외. */
  requirement: SectionRequirement;
  /** true면 컨버터 미사용 제품에는 기본적으로 제외 추천 (요청서 §7 조건부 규칙) */
  requiresConverter?: boolean;
}

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  { key: 'revision_history', title: { ko: '개정이력', zh: '修订历史', en: 'Revision History' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'general_spec', title: { ko: '일반사양', zh: '一般规格', en: 'General Specification' }, defaultIncluded: true, requirement: 'required' },
  { key: 'optical', title: { ko: '광학특성', zh: '光学特性', en: 'Optical Characteristics' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'product_overview', title: { ko: '제품 개요', zh: '产品概述', en: 'Product Overview' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'product_dimension', title: { ko: '제품 치수', zh: '产品尺寸', en: 'Product Dimensions' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'packing_spec', title: { ko: '포장사양', zh: '包装规格', en: 'Packing Specification' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'evaluation_test', title: { ko: '평가시험 자료', zh: '评估测试数据', en: 'Evaluation Test Data' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'outgoing_inspection', title: { ko: '출하검사', zh: '出货检验', en: 'Outgoing Inspection' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'certification', title: { ko: '인증', zh: '认证', en: 'Certification' }, defaultIncluded: true, requirement: 'required' },
  { key: 'key_component', title: { ko: '핵심부품 사양서', zh: '关键部件规格书', en: 'Key Component Datasheet' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'flame_resistance', title: { ko: '난연자료', zh: '阻燃资料', en: 'Flame Resistance' }, defaultIncluded: false, requirement: 'optional' },
  { key: 'converter_partlist', title: { ko: '컨버터 부품표', zh: '驱动电源部件清单', en: 'Converter Part List' }, defaultIncluded: true, requirement: 'required', requiresConverter: true },
  { key: 'circuit_diagram', title: { ko: '회로도', zh: '电路图', en: 'Circuit Diagram' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'pcb_drawing', title: { ko: 'PCB 도면', zh: 'PCB图纸', en: 'PCB Drawing' }, defaultIncluded: true, requirement: 'recommended' },
  { key: 'rohs', title: { ko: 'RoHS 및 환경자료', zh: 'RoHS及环境资料', en: 'RoHS Check Sheet' }, defaultIncluded: false, requirement: 'optional' },
  { key: 'reliability_test', title: { ko: '신뢰성 시험', zh: '可靠性测试', en: 'Reliability Test Report' }, defaultIncluded: false, requirement: 'optional' },
];

export function getSectionDefinition(key: BuiltinSectionType): SectionDefinition | undefined {
  return SECTION_DEFINITIONS.find(d => d.key === key);
}

/**
 * 요청서 §2 "제품 분류에 따라 권장 섹션과 입력 도움말이 달라지게 한다"에 대응 — 완제품
 * 등기구가 아닌 부품/모듈 단위 제품(컨버터 단품, LED 모듈)은 일부 섹션이 의미가 없거나
 * 반대로 더 중요해진다. 여기서 정의한 값은 어디까지나 "기본값"이며 사용자가 섹션 구성
 * 화면에서 언제든 다시 켜고 끌 수 있다(강제 아님).
 */
const CATEGORY_SECTION_OVERRIDES: Partial<Record<string, Partial<Record<BuiltinSectionType, boolean>>>> = {
  // 컨버터 단품: 빛을 내는 제품이 아니므로 광학특성은 기본 제외, 회로도/PCB/부품표는 핵심이라 유지.
  '컨버터': { optical: false },
  // LED 모듈(등기구가 아닌 모듈 단품): 컨버터가 내장돼 있지 않은 경우가 대부분이라 컨버터
  // 부품표는 기본 제외 — 실제로 컨버터 일체형이면 사용자가 섹션 화면에서 다시 켜면 된다.
  'LED 모듈': { converter_partlist: false },
};

/** 프로젝트 생성 시 섹션별 기본 포함 여부를 계산한다 — defaultIncluded(섹션 자체 기본값)
 * → hasConverter(요구 컨버터 섹션인데 컨버터 없음이 명시된 경우) → productCategory(위 표)
 * 순으로 덮어쓴다. 세 규칙이 겹치면 더 구체적인 규칙(카테고리)이 마지막에 적용되어 우선한다. */
export function resolveDefaultIncluded(def: SectionDefinition, opts: { productCategory?: string | null; hasConverter?: boolean | null }): boolean {
  let included = def.defaultIncluded;
  if (def.requiresConverter && opts.hasConverter === false) included = false;
  const override = opts.productCategory ? CATEGORY_SECTION_OVERRIDES[opts.productCategory]?.[def.key] : undefined;
  if (override !== undefined) included = override;
  return included;
}

export function defaultTitleFor(sectionType: string, lang: 'ko' | 'zh' | 'en'): string {
  const def = SECTION_DEFINITIONS.find(d => d.key === sectionType);
  return def ? def.title[lang] : sectionType;
}
