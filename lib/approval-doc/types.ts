export type Lang = 'ko' | 'zh' | 'en';
export type I18nText = Record<Lang, string>;

/** 원문/한국어값을 분리 저장하는 공통 구조 (lib/supplier-form의 TranslatableValue와 동일 패턴) */
export interface TranslatableValue {
  original: string;
  lang: Lang;
  korean: string;
  translationStatus: 'none' | 'auto' | 'manual' | 'confirmed';
  reviewed: boolean;
  updatedAt: string;
}

/** 16개 빌트인 + 사용자 정의 섹션 타입 키. section-registry.ts가 유일한 정의처. */
export type BuiltinSectionType =
  | 'revision_history'
  | 'general_spec'
  | 'optical'
  | 'product_overview'
  | 'product_dimension'
  | 'packing_spec'
  | 'evaluation_test'
  | 'outgoing_inspection'
  | 'certification'
  | 'key_component'
  | 'flame_resistance'
  | 'converter_partlist'
  | 'circuit_diagram'
  | 'pcb_drawing'
  | 'rohs'
  | 'reliability_test';

export type SectionType = BuiltinSectionType | 'custom';

/** DB(approval_doc_sections) 한 행에 대응 — 프로젝트별 "장" 인스턴스 (아직 채번 안 됨) */
export interface SectionInstance {
  id: string;
  projectId: string;
  sectionType: SectionType;
  included: boolean;
  sortOrder: number;
  customTitle?: string | null;
}

/** numbering.ts의 출력 — 실제 포함된 장에 대해 장번호까지 확정된 상태 */
export interface NumberedSection {
  id: string;
  sectionType: SectionType;
  title: string;
  chapterNumber: number;
}

/** docx-build.ts에 넘길 섹션별 렌더링 콘텐츠. paragraphs는 일반 본문 문단, table은 있으면
 * 실제 Word 표(반복 헤더행 포함)로 렌더링된다, attachments는 이미지로 삽입되지 않은
 * 첨부파일을 캡션과 함께 목록으로만 나열한다, images는 PNG 버퍼를 실제 페이지 이미지로
 * 삽입한다(원본 이미지 업로드 또는 PDF 특정 페이지 래스터화 결과 — 둘 다 이 배열 하나로
 * 처리해 docx-build.ts는 "PDF였는지 이미지였는지" 구분할 필요가 없다). */
export interface SectionContent {
  sectionInstanceId: string;
  paragraphs: string[];
  table?: { headers: string[]; rows: string[][] };
  attachments?: { filename: string; description?: string | null }[];
  images?: { buffer: Buffer; width: number; height: number; caption?: string | null }[];
}

export interface DocProjectMeta {
  businessId: string;
  productName: string;
  modelName: string;
  customerName?: string;
  supplierName?: string;
  revision: string;
  issueDate: string;
}

/** pagination.ts의 출력 — sectionInstanceId -> 1-based 실제 페이지번호 */
export type TocPageMap = Record<string, number>;
