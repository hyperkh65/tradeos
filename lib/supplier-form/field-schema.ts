/**
 * 중국 공급업체 자료요청 시스템 — 필드 스키마 & DOCX 매핑 (template_version: v1)
 *
 * 원본 파일: "parking-lot light PIR type for Kumho_R(1)(1).docx"
 * (고효율 인증 시험 자료 요청 양식, A4 세로, 단일 섹션, 표 10개, 명시적 페이지나눔 없음)
 *
 * 이 파일이 유일한 진실의 원천(source of truth)이다:
 *  - 웹 작성 화면의 항목/라벨/필수여부
 *  - 제출 시 검증 규칙
 *  - DOCX 생성 시 값을 꽂을 위치(표 번호/행/열, 또는 본문 문단)
 *  - XLSX 생성 시 시트 컬럼
 *
 * DOCX 좌표계: 원본 문서의 최상위 표를 순서대로 표1~표10 (1-indexed),
 * 표 안의 행/열은 0-indexed. tables_dump2.txt 분석 결과와 정확히 일치해야 하며,
 * 새로 원본 파일이 교체되면 반드시 이 좌표를 다시 검증한 뒤 template_version을 올린다.
 *
 * 프로젝트에는 언제나 이 파일을 만들 당시의 template_version을 저장해두고,
 * 과거 마감본은 스냅샷(JSON)으로 재현하므로 이 파일이 나중에 바뀌어도 영향받지 않는다.
 */

export const TEMPLATE_VERSION = 'v1';

export type Lang = 'ko' | 'zh' | 'en';
export type I18nText = Record<Lang, string>;

export type ConverterType = 'has_converter' | 'no_converter' | 'integrated' | 'na';

export const CONVERTER_TYPE_LABELS: Record<ConverterType, I18nText> = {
  has_converter: { ko: '컨버터 있음', zh: '有驱动电源', en: 'With Converter' },
  no_converter: { ko: '컨버터 없음', zh: '无驱动电源', en: 'Without Converter' },
  integrated: { ko: '등기구 일체형 컨버터', zh: '灯具一体式驱动电源', en: 'Integrated Converter' },
  na: { ko: '해당 없음', zh: '不适用', en: 'Not Applicable' },
};

/** 값 하나에 대해 원문/한국어값을 분리 저장하는 공통 구조 (요청서 5-6번 항목의 핵심 요구사항) */
export interface TranslatableValue {
  original: string;
  lang: Lang;
  korean: string;
  translationStatus: 'none' | 'auto' | 'manual' | 'confirmed';
  reviewed: boolean;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. 시험 구분 (표1 — 4칸 체크박스, ☐/▒ 문자 치환 방식. 원본 검토 결과 4개는
//    서로 배타적이지 않은 개별 체크박스라 다중 선택으로 모델링한다.)
// ─────────────────────────────────────────────────────────────────────────
export type TestCategory = 'base' | 'derived' | 'part_change' | 'multi_component';

export const TEST_CATEGORY_OPTIONS: { key: TestCategory; label: I18nText; docx: { table: 1; col: number } }[] = [
  { key: 'base', label: { ko: '기본모델', zh: '基本型号', en: 'Base Model' }, docx: { table: 1, col: 0 } },
  { key: 'derived', label: { ko: '파생모델', zh: '派生型号', en: 'Derived Model' }, docx: { table: 1, col: 1 } },
  { key: 'part_change', label: { ko: '부품변경', zh: '部件变更', en: 'Component Change' }, docx: { table: 1, col: 2 } },
  { key: 'multi_component', label: { ko: '복수부품', zh: '多组件登记', en: 'Multiple Components' }, docx: { table: 1, col: 3 } },
];

// ─────────────────────────────────────────────────────────────────────────
// 2. 기본모델 발행기관 / 시험성적서 발행일 / 시험성적서 번호
//    → 표가 아니라 표1 바로 아래 본문 문단("⦁기본모델 발행기관: -" 형태)에 위치.
//    DOCX 치환은 표 셀이 아니라 "해당 텍스트를 포함하는 문단"을 찾아 콜론 뒤 텍스트를 교체.
// ─────────────────────────────────────────────────────────────────────────
export const BASE_MODEL_INFO_FIELDS: {
  key: string; label: I18nText; required: boolean;
  docx: { kind: 'paragraph'; matchPrefix: string };
}[] = [
  { key: 'baseModelIssuer', label: { ko: '기본모델 발행기관', zh: '基本型号发证机构', en: 'Base Model Issuing Body' }, required: false,
    docx: { kind: 'paragraph', matchPrefix: '⦁기본모델 발행기관' } },
  { key: 'baseModelReportDate', label: { ko: '시험성적서 발행일', zh: '检测报告签发日期', en: 'Test Report Issue Date' }, required: false,
    docx: { kind: 'paragraph', matchPrefix: '⦁시험성적서 발행일' } },
  { key: 'baseModelReportNo', label: { ko: '시험성적서 번호', zh: '检测报告编号', en: 'Test Report No.' }, required: false,
    docx: { kind: 'paragraph', matchPrefix: '⦁시험성적서 번호' } },
];
// 위 3개는 "변경이나 파생일 경우에만" 필수 — 검증 규칙에서 testCategory에 derived/part_change 포함 시 required 처리.

// ─────────────────────────────────────────────────────────────────────────
// 3. 파생모델 및 부품변경 구분 (표2 — 좌우 2단, 항목별 확인 체크 "√")
// ─────────────────────────────────────────────────────────────────────────
export const DERIVED_CHANGE_ITEMS: { key: string; label: I18nText; docx: { table: 2; row: number; checkCol: number } }[] = [
  { key: 'heatsink', label: { ko: '방열판', zh: '散热片', en: 'Heatsink' }, docx: { table: 2, row: 1, checkCol: 2 } },
  { key: 'ledPcb', label: { ko: 'LED PCB', zh: 'LED PCB', en: 'LED PCB' }, docx: { table: 2, row: 2, checkCol: 2 } },
  { key: 'housing', label: { ko: '외형', zh: '外壳', en: 'Housing' }, docx: { table: 2, row: 3, checkCol: 2 } },
  { key: 'diffuserCover', label: { ko: '확산커버', zh: '扩散罩', en: 'Diffuser Cover' }, docx: { table: 2, row: 4, checkCol: 2 } },
  { key: 'lens', label: { ko: '렌즈', zh: '透镜', en: 'Lens' }, docx: { table: 2, row: 5, checkCol: 2 } },
  { key: 'ledConverter', label: { ko: 'LED컨버터', zh: 'LED驱动电源', en: 'LED Converter' }, docx: { table: 2, row: 1, checkCol: 5 } },
  { key: 'ledPackage', label: { ko: 'LED Package', zh: 'LED封装', en: 'LED Package' }, docx: { table: 2, row: 2, checkCol: 5 } },
  { key: 'ledPackageQty', label: { ko: 'LED Package 수량', zh: 'LED封装数量', en: 'LED Package Qty' }, docx: { table: 2, row: 3, checkCol: 5 } },
  { key: 'ledPackageArray', label: { ko: 'LED Package 배열', zh: 'LED封装排列', en: 'LED Package Array' }, docx: { table: 2, row: 4, checkCol: 5 } },
];

// ─────────────────────────────────────────────────────────────────────────
// 4. 표시사항 (표3 — 2열×15행, 좌열=고정 라벨 절대 불변, 우열=값. 15번 항목은
//    원본이 "직렬/병렬" 두 값을 한 셀에 합쳐 쓰는 관례라 세 값을 합쳐서 채운다.)
//    9번 항목(원산지표시)도 원산지/상표/제조자명/공급자명 네 값을 한 셀에 합친다.
// ─────────────────────────────────────────────────────────────────────────
export interface DisplayField {
  key: string;
  label: I18nText;
  help?: I18nText;
  required: boolean;
  /** 원문 보존이 필요한 값(번역 금지 대상: 모델명/회사명/인증번호/수치/단위 등) */
  preserveOriginal: boolean;
  format: 'text' | 'number+unit';
  docx: { table: 3; row: number; col: 1 };
}

export const DISPLAY_FIELDS: DisplayField[] = [
  { key: 'itemNameModelName', label: { ko: '품목명 및 모델명', zh: '品名及型号', en: 'Item Name & Model Name' }, required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 1, col: 1 } },
  { key: 'ratedVoltage', label: { ko: '정격 전압', zh: '额定电压', en: 'Rated Voltage' }, required: true, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 2, col: 1 } },
  { key: 'ratedPower', label: { ko: '정격 전력', zh: '额定功率', en: 'Rated Power' }, required: true, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 3, col: 1 } },
  { key: 'ratedCurrent', label: { ko: '정격 전류', zh: '额定电流', en: 'Rated Current' }, required: false, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 4, col: 1 } },
  { key: 'ratedLuminousFlux', label: { ko: '정격 광속', zh: '额定光通量', en: 'Rated Luminous Flux' }, required: false, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 5, col: 1 } },
  { key: 'luminousEfficacy', label: { ko: '광효율', zh: '光效', en: 'Luminous Efficacy' }, required: false, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 6, col: 1 } },
  { key: 'correlatedColorTemp', label: { ko: '상관색온도', zh: '相关色温', en: 'CCT' }, required: true, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 7, col: 1 } },
  { key: 'cri', label: { ko: '연색지수', zh: '显色指数', en: 'CRI' }, required: true, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 8, col: 1 } },
  // 9번: 원산지/상표/제조자명/공급자명 — 4개 하위값을 한 셀에 결합
  { key: 'originMarking', label: { ko: '원산지표시(상표,제조자명,공급자명)', zh: '原产地标识(商标、制造商、供应商)', en: 'Origin Marking (Trademark/Manufacturer/Supplier)' }, required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 9, col: 1 } },
  { key: 'asContact', label: { ko: 'A/S연락처', zh: '售后服务电话', en: 'A/S Contact' }, required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 10, col: 1 } },
  { key: 'manufactureDate', label: { ko: '제조연월', zh: '制造年月', en: 'Manufacture Date' }, required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 11, col: 1 } },
  { key: 'fixtureKsKcNo', label: { ko: '등기구 KS 또는 KC 인증번호', zh: '灯具 KS 或 KC 认证编号', en: 'Fixture KS/KC Cert No.' }, required: false, preserveOriginal: true, format: 'text', docx: { table: 3, row: 12, col: 1 } },
  { key: 'converterKsKcNo', label: { ko: '컨버터 KS 또는 KC 인증번호', zh: '驱动电源 KS 或 KC 认证编号', en: 'Converter KS/KC Cert No.' }, required: false, preserveOriginal: true, format: 'text', docx: { table: 3, row: 13, col: 1 } },
  // 15번: 직렬/병렬/총수량 — 3개 하위값을 한 셀에 결합
  { key: 'ledPackageArrayTotal', label: { ko: '등기구 전체 LED Package 배열', zh: '灯具整体 LED 封装排列', en: 'Total LED Package Array' }, required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 14, col: 1 } },
];

// 9번 항목의 하위 구조 (웹 폼에서는 분리 입력 → DOCX 저장 시 결합)
export const ORIGIN_MARKING_SUBFIELDS = ['originCountry', 'trademark', 'manufacturerName', 'supplierName'] as const;
// 15번 항목의 하위 구조
export const LED_ARRAY_SUBFIELDS = ['ledSeriesCount', 'ledParallelCount', 'ledTotalCount'] as const;
// (원본 예시 값 "직렬: 1S병렬:P", "중국(금호조명등구(상숙)유한공사)" 형식을 그대로 따름)

/**
 * originMarking/ledPackageArrayTotal은 하위 필드를 결합해서만 존재하는 "계산된" 값이라
 * formData에 그 키로 직접 저장되지 않는다. DOCX·XLSX 생성기가 각자 다시 구현하면 결합 규칙이
 * 어긋날 위험이 있어(실제로 XLSX 쪽에서 한 번 누락되어 발견됨) 이 함수 하나로 통일한다.
 */
export function getDisplayFieldValue(key: string, kv: (fieldKey: string) => string): string {
  if (key === 'originMarking') {
    const parts = [kv('trademark'), kv('manufacturerName'), kv('supplierName')].filter(Boolean);
    return `${kv('originCountry')}${parts.length ? `(${parts.join(', ')})` : ''}`;
  }
  if (key === 'ledPackageArrayTotal') {
    return `직렬: ${kv('ledSeriesCount') || '-'}S 병렬: ${kv('ledParallelCount') || '-'}P 총: ${kv('ledTotalCount') || '-'}EA`;
  }
  return kv(key);
}

// ─────────────────────────────────────────────────────────────────────────
// 5. 등기구 부품 리스트 (표4 — 8개 고정 행. 사용자가 행을 추가하면 마지막 행
//    서식을 복제해서 삽입.)
//
//    셀 인덱스는 실제 document.xml을 grid column 누적폭 계산으로 정밀 검증한 값이다
//    (colLayout 이름만으로 유추하지 말 것 — 방열판 행은 라벨 셀이 2개라 인덱스가 다르다):
//      'simple'   (컨버터/LED Package, 6셀 c0~c5): c0=라벨(건드리지 않음) c1=형명 c2=명세 c3=수량 c4=제조회사 c5=비고
//      'detailed' (LED PCB/외함/확산커버/렌즈, 9셀 c0~c8): c0=라벨(span2) c1=형명 c2=재질 c3=가로 c4=세로 c5=높이 c6=수량 c7=제조회사 c8=비고
//      'heatsink' (방열판×2, 10셀 c0~c9): c0=상위라벨"방열판" c1=하위라벨"외함/모듈" c2=형명 c3=재질 c4=가로 c5=세로 c6=높이 c7=수량 c8=제조회사 c9=비고
// ─────────────────────────────────────────────────────────────────────────
export type FixturePartRowKey =
  | 'converter' | 'led_package' | 'led_pcb' | 'housing' | 'diffuser_cover'
  | 'lens' | 'heatsink_housing_type' | 'heatsink_module_type';

export interface FixturePartCellMap {
  modelName: number; specText?: number; material?: number; width?: number; depth?: number; height?: number;
  qty: number; manufacturer: number; remark: number;
}

export const FIXTURE_PART_FIXED_ROWS: {
  rowKey: string; label: I18nText; colLayout: 'simple' | 'detailed' | 'heatsink'; cells: FixturePartCellMap;
  docx: { table: 4; row: number };
}[] = [
  { rowKey: 'converter', label: { ko: '조명기구용컨버터(LED램프용)', zh: 'LED灯具用驱动电源', en: 'Converter (for LED lamp)' }, colLayout: 'simple', cells: { modelName: 1, specText: 2, qty: 3, manufacturer: 4, remark: 5 }, docx: { table: 4, row: 1 } },
  { rowKey: 'led_package', label: { ko: 'LED Package', zh: 'LED封装', en: 'LED Package' }, colLayout: 'simple', cells: { modelName: 1, specText: 2, qty: 3, manufacturer: 4, remark: 5 }, docx: { table: 4, row: 2 } },
  { rowKey: 'led_pcb', label: { ko: 'LED PCB', zh: 'LED PCB', en: 'LED PCB' }, colLayout: 'detailed', cells: { modelName: 1, material: 2, width: 3, depth: 4, height: 5, qty: 6, manufacturer: 7, remark: 8 }, docx: { table: 4, row: 6 } },
  { rowKey: 'housing', label: { ko: '외함', zh: '外壳', en: 'Housing' }, colLayout: 'detailed', cells: { modelName: 1, material: 2, width: 3, depth: 4, height: 5, qty: 6, manufacturer: 7, remark: 8 }, docx: { table: 4, row: 7 } },
  { rowKey: 'diffuser_cover', label: { ko: '확산커버', zh: '扩散罩', en: 'Diffuser Cover' }, colLayout: 'detailed', cells: { modelName: 1, material: 2, width: 3, depth: 4, height: 5, qty: 6, manufacturer: 7, remark: 8 }, docx: { table: 4, row: 8 } },
  { rowKey: 'lens', label: { ko: '렌즈', zh: '透镜', en: 'Lens' }, colLayout: 'detailed', cells: { modelName: 1, material: 2, width: 3, depth: 4, height: 5, qty: 6, manufacturer: 7, remark: 8 }, docx: { table: 4, row: 9 } },
  // 방열판은 "외함형/모듈형" 둘 중 하나만 채우는 구조 (원본 각주: 외함과 방열판이 같으면 외함형에,
  // LED모듈형 타입이면 모듈형에 기입)
  { rowKey: 'heatsink_housing_type', label: { ko: '방열판(외함형)', zh: '散热片(外壳型)', en: 'Heatsink (Housing type)' }, colLayout: 'heatsink', cells: { modelName: 2, material: 3, width: 4, depth: 5, height: 6, qty: 7, manufacturer: 8, remark: 9 }, docx: { table: 4, row: 10 } },
  { rowKey: 'heatsink_module_type', label: { ko: '방열판(모듈형)', zh: '散热片(模块型)', en: 'Heatsink (Module type)' }, colLayout: 'heatsink', cells: { modelName: 2, material: 3, width: 4, depth: 5, height: 6, qty: 7, manufacturer: 8, remark: 9 }, docx: { table: 4, row: 11 } },
];

// ─────────────────────────────────────────────────────────────────────────
// 6. 컨버터 내부 부품 리스트 (표5 — "일체형 컨버터"일 때만 작성. 8개 예시 행이
//    있으나 고정 카테고리라기보다 "흔한 부품 예시"이므로 8행을 기본 스캐폴드로
//    제공하되 전부 사용자가 자유롭게 수정/삭제/추가 가능한 반복 리스트로 취급)
//    열: [부품, 형명, 명세, 수량, 제조회사, 비고]
// ─────────────────────────────────────────────────────────────────────────
export const CONVERTER_PART_SUGGESTED_ROWS: string[] = [
  '컨버터PCB', 'FUSE', 'X-CAPACITOR', 'Y-CAPACITOR', 'Varistor', 'Transformer', 'Input wire', 'Line Filter',
];
export const CONVERTER_PART_TABLE_DOCX = { table: 5 as const, headerRow: 0, firstDataRow: 1 };

// ─────────────────────────────────────────────────────────────────────────
// 7. 복수부품 등재 (표6 — 순수 반복 표. 헤더 1행 + 데이터 행 개수만큼 출력,
//    미입력이면 빈 행을 출력하지 않는다.) 열 구성은 표4/5와 동일.
// ─────────────────────────────────────────────────────────────────────────
export const MULTI_COMPONENT_TABLE_DOCX = { table: 6 as const, headerRow: 0, firstDataRow: 1 };

// ─────────────────────────────────────────────────────────────────────────
// 8. 첨부파일 카테고리 — 컨버터 사용여부에 따라 표시 항목이 달라진다.
//    isImageInsertTarget: 원본 표7~10(회로도/PCB패턴도/구조도)에 삽입되는 이미지 자료.
// ─────────────────────────────────────────────────────────────────────────
export interface AttachmentCategoryDef {
  key: string;
  label: I18nText;
  required: boolean | 'conditional';
  visibleWhen: ConverterType[] | 'always';
  accept: 'pdf';
  isImageInsertTarget?: { table: 7 | 8 | 9 | 10 };
}

export const ATTACHMENT_CATEGORIES: AttachmentCategoryDef[] = [
  // 공통 필수/해당시 필수
  { key: 'lm80_report', label: { ko: 'LM-80 시험성적서', zh: 'LM-80 检测报告', en: 'LM-80 Test Report' }, required: 'conditional', visibleWhen: 'always', accept: 'pdf' },
  { key: 'led_package_spec', label: { ko: 'LED Package/Chip 사양서', zh: 'LED封装/芯片规格书', en: 'LED Package/Chip Datasheet' }, required: true, visibleWhen: 'always', accept: 'pdf' },
  { key: 'fixture_ks_kc_cert', label: { ko: '등기구 KS 또는 KC 인증서', zh: '灯具 KS 或 KC 认证证书', en: 'Fixture KS/KC Certificate' }, required: 'conditional', visibleWhen: 'always', accept: 'pdf' },
  { key: 'base_model_hee_report', label: { ko: '기본모델 고효율 시험성적서', zh: '基本型号高效认证检测报告', en: 'Base Model HEE Test Report' }, required: 'conditional', visibleWhen: 'always', accept: 'pdf' },
  { key: 'product_structure_diagram', label: { ko: '제품 구조도', zh: '产品结构图', en: 'Product Structure Diagram' }, required: true, visibleWhen: 'always', accept: 'pdf', isImageInsertTarget: { table: 9 } },
  { key: 'etc_general', label: { ko: '기타 관련 자료', zh: '其他相关资料', en: 'Other Related Documents' }, required: false, visibleWhen: 'always', accept: 'pdf' },

  // 컨버터 있음
  { key: 'converter_ks_kc_cert', label: { ko: '컨버터 KS 또는 KC 인증서', zh: '驱动电源 KS 或 KC 认证证书', en: 'Converter KS/KC Certificate' }, required: true, visibleWhen: ['has_converter'], accept: 'pdf' },
  { key: 'converter_spec', label: { ko: '컨버터 사양서', zh: '驱动电源规格书', en: 'Converter Datasheet' }, required: true, visibleWhen: ['has_converter'], accept: 'pdf' },
  { key: 'led_module_circuit_a', label: { ko: 'LED 모듈 회로도', zh: 'LED模块电路图', en: 'LED Module Circuit Diagram' }, required: true, visibleWhen: ['has_converter'], accept: 'pdf', isImageInsertTarget: { table: 7 } },
  { key: 'led_module_pcb_a', label: { ko: 'LED 모듈 PCB 패턴도', zh: 'LED模块PCB版图', en: 'LED Module PCB Pattern' }, required: true, visibleWhen: ['has_converter'], accept: 'pdf', isImageInsertTarget: { table: 8 } },
  { key: 'converter_circuit', label: { ko: '컨버터 회로도', zh: '驱动电源电路图', en: 'Converter Circuit Diagram' }, required: true, visibleWhen: ['has_converter'], accept: 'pdf', isImageInsertTarget: { table: 10 } },
  { key: 'converter_pcb', label: { ko: '컨버터 PCB 패턴도', zh: '驱动电源PCB版图', en: 'Converter PCB Pattern' }, required: true, visibleWhen: ['has_converter'], accept: 'pdf', isImageInsertTarget: { table: 10 } },
  { key: 'converter_parts_list_pdf', label: { ko: '컨버터 부품 리스트', zh: '驱动电源部件清单', en: 'Converter Parts List' }, required: false, visibleWhen: ['has_converter'], accept: 'pdf' },
  { key: 'etc_converter', label: { ko: '기타 컨버터 관련 자료', zh: '其他驱动电源相关资料', en: 'Other Converter Documents' }, required: false, visibleWhen: ['has_converter'], accept: 'pdf' },

  // 컨버터 없음
  { key: 'fixture_circuit', label: { ko: '등기구 전체 회로도', zh: '灯具整体电路图', en: 'Fixture Overall Circuit Diagram' }, required: true, visibleWhen: ['no_converter'], accept: 'pdf', isImageInsertTarget: { table: 7 } },
  { key: 'fixture_pcb', label: { ko: '등기구 전체 PCB 패턴도', zh: '灯具整体PCB版图', en: 'Fixture Overall PCB Pattern' }, required: true, visibleWhen: ['no_converter'], accept: 'pdf', isImageInsertTarget: { table: 8 } },
  { key: 'led_module_circuit_b', label: { ko: 'LED 모듈 회로도', zh: 'LED模块电路图', en: 'LED Module Circuit Diagram' }, required: true, visibleWhen: ['no_converter'], accept: 'pdf' },
  { key: 'led_module_pcb_b', label: { ko: 'LED 모듈 PCB 패턴도', zh: 'LED模块PCB版图', en: 'LED Module PCB Pattern' }, required: true, visibleWhen: ['no_converter'], accept: 'pdf' },
  { key: 'etc_fixture_no_conv', label: { ko: '기타 등기구 관련 자료', zh: '其他灯具相关资料', en: 'Other Fixture Documents' }, required: false, visibleWhen: ['no_converter'], accept: 'pdf' },

  // 일체형 컨버터
  { key: 'fixture_circuit_int', label: { ko: '등기구 전체 회로도', zh: '灯具整体电路图', en: 'Fixture Overall Circuit Diagram' }, required: true, visibleWhen: ['integrated'], accept: 'pdf', isImageInsertTarget: { table: 7 } },
  { key: 'fixture_pcb_int', label: { ko: '등기구 전체 PCB 패턴도', zh: '灯具整体PCB版图', en: 'Fixture Overall PCB Pattern' }, required: true, visibleWhen: ['integrated'], accept: 'pdf', isImageInsertTarget: { table: 8 } },
  { key: 'led_module_circuit_int', label: { ko: 'LED 모듈 회로도', zh: 'LED模块电路图', en: 'LED Module Circuit Diagram' }, required: true, visibleWhen: ['integrated'], accept: 'pdf' },
  { key: 'led_module_pcb_int', label: { ko: 'LED 모듈 PCB 패턴도', zh: 'LED模块PCB版图', en: 'LED Module PCB Pattern' }, required: true, visibleWhen: ['integrated'], accept: 'pdf' },
  { key: 'converter_circuit_int', label: { ko: '컨버터 회로도', zh: '驱动电源电路图', en: 'Converter Circuit Diagram' }, required: true, visibleWhen: ['integrated'], accept: 'pdf', isImageInsertTarget: { table: 10 } },
  { key: 'converter_pcb_int', label: { ko: '컨버터 PCB 패턴도', zh: '驱动电源PCB版图', en: 'Converter PCB Pattern' }, required: true, visibleWhen: ['integrated'], accept: 'pdf', isImageInsertTarget: { table: 10 } },
  { key: 'integrated_converter_parts_list', label: { ko: '일체형 컨버터 부품 리스트', zh: '一体式驱动电源部件清单', en: 'Integrated Converter Parts List' }, required: false, visibleWhen: ['integrated'], accept: 'pdf' },
];

export function getVisibleAttachmentCategories(converterType: ConverterType): AttachmentCategoryDef[] {
  return ATTACHMENT_CATEGORIES.filter(c => c.visibleWhen === 'always' || c.visibleWhen.includes(converterType));
}

// ─────────────────────────────────────────────────────────────────────────
// 9. 제출 검증 규칙에서 참조하는 LED 배열 필드 (직렬×병렬=총수량 일치 검사용)
// ─────────────────────────────────────────────────────────────────────────
export const LED_ARRAY_VALIDATION_FIELDS = {
  series: 'ledSeriesCount', parallel: 'ledParallelCount', total: 'ledTotalCount',
} as const;
