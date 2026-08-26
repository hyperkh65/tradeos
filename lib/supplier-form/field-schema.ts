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

/** 외부 작성 화면 맨 위에 항상 표시되는 안내문 — 외국 공급업체는 이게 무슨 인증인지 모를 수 있어
 * "고효율 인증을 받기 위한 자료 요청"이라는 목적과, 제품에 맞게 작성하라는 안내를 명확히 한다. */
export const INTRO_TEXT: I18nText = {
  ko: '이 양식은 한국 고효율에너지기자재(고효율) 인증을 받기 위해 필요한 제품 자료를 요청하는 문서입니다. 아래 항목을 귀사의 실제 제품 사양에 맞게 정확하게 작성해 주세요. 모델명·인증번호·수치·단위 등은 원문 그대로 입력하시면 됩니다(번역 불필요).',
  zh: '本表格用于收集申请韩国高效节能设备（高效）认证所需的产品资料。请根据贵公司实际产品规格准确填写以下内容。型号、认证编号、数值、单位等请直接填写原文（无需翻译成韩文）。',
  en: 'This form collects the product information required to obtain Korea\'s High-Efficiency Energy Equipment (HEE) certification. Please fill in the items below accurately according to your actual product specifications. Model names, certificate numbers, values, and units may be entered in their original form (no translation needed).',
};

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

export const TEST_CATEGORY_OPTIONS: { key: TestCategory; label: I18nText; help: I18nText; docx: { table: 1; col: number } }[] = [
  {
    key: 'base', label: { ko: '기본모델', zh: '基本型号', en: 'Base Model' },
    help: {
      ko: '처음으로 인증 시험을 신청하는 신규 제품인 경우 선택하세요.',
      zh: '如果是首次申请认证检测的全新产品，请选择此项。',
      en: 'Select this if it is a new product being submitted for certification testing for the first time.',
    },
    docx: { table: 1, col: 0 },
  },
  {
    key: 'derived', label: { ko: '파생모델', zh: '派生型号', en: 'Derived Model' },
    help: {
      ko: '이미 인증받은 기본모델을 바탕으로 일부 사양(색온도, 광속 등)만 다른 파생 제품인 경우 선택하세요. 기본모델 정보를 함께 입력해야 합니다.',
      zh: '如果是基于已认证的基本型号、仅部分规格（色温、光通量等）不同的派生产品，请选择此项。需同时填写基本型号信息。',
      en: 'Select this if the product is derived from an already-certified base model with only some specifications (CCT, luminous flux, etc.) changed. Base model information must also be provided.',
    },
    docx: { table: 1, col: 1 },
  },
  {
    key: 'part_change', label: { ko: '부품변경', zh: '部件变更', en: 'Component Change' },
    help: {
      ko: '이미 인증받은 제품에서 부품(컨버터, LED Package 등)만 변경된 경우 선택하세요.',
      zh: '如果只是已认证产品中的部件（驱动电源、LED封装等）发生变更，请选择此项。',
      en: 'Select this if only a component (converter, LED Package, etc.) has changed from an already-certified product.',
    },
    docx: { table: 1, col: 2 },
  },
  {
    key: 'multi_component', label: { ko: '복수부품', zh: '多组件登记', en: 'Multiple Components' },
    help: {
      ko: '동일한 성능을 가진 부품 여러 개를 함께 등록하려는 경우 선택하세요. (아래 "복수부품 등재"에 입력)',
      zh: '如果要同时登记多个性能相同的部件，请选择此项。（请填写下方"多组件登记"）',
      en: 'Select this if you want to register multiple components with identical performance together (fill in "Multiple Component Registration" below).',
    },
    docx: { table: 1, col: 3 },
  },
];

// ─────────────────────────────────────────────────────────────────────────
// 2. 기본모델 발행기관 / 시험성적서 발행일 / 시험성적서 번호
//    → 표가 아니라 표1 바로 아래 본문 문단("⦁기본모델 발행기관: -" 형태)에 위치.
//    DOCX 치환은 표 셀이 아니라 "해당 텍스트를 포함하는 문단"을 찾아 콜론 뒤 텍스트를 교체.
// ─────────────────────────────────────────────────────────────────────────
export const BASE_MODEL_INFO_FIELDS: {
  key: string; label: I18nText; help?: I18nText; example?: string; required: boolean;
  docx: { kind: 'paragraph'; matchPrefix: string };
}[] = [
  { key: 'baseModelIssuer', label: { ko: '기본모델 발행기관', zh: '基本型号发证机构', en: 'Base Model Issuing Body' },
    help: { ko: '기본모델의 고효율 인증서를 발행한 시험기관명입니다.', zh: '为基本型号发放高效认证证书的检测机构名称。', en: 'The name of the testing body that issued the HEE certificate for the base model.' },
    example: 'KTC 한국기계전기전자시험연구원', required: false, docx: { kind: 'paragraph', matchPrefix: '⦁기본모델 발행기관' } },
  { key: 'baseModelReportDate', label: { ko: '시험성적서 발행일', zh: '检测报告签发日期', en: 'Test Report Issue Date' },
    example: '2026.01.15', required: false, docx: { kind: 'paragraph', matchPrefix: '⦁시험성적서 발행일' } },
  { key: 'baseModelReportNo', label: { ko: '시험성적서 번호', zh: '检测报告编号', en: 'Test Report No.' },
    help: { ko: '아직 시험이 진행 중이면 KTR 접수번호를 기재하세요.', zh: '如检测仍在进行中，请填写KTR受理编号。', en: 'If testing is still in progress, enter the KTR receipt number instead.' },
    example: 'HEE2026-0000', required: false, docx: { kind: 'paragraph', matchPrefix: '⦁시험성적서 번호' } },
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
  /** 화면에 회색 placeholder처럼 보여줄 예시값 (언어 무관 — 수치/모델명 형식이므로 공통) */
  example?: string;
  required: boolean;
  /** 원문 보존이 필요한 값(번역 금지 대상: 모델명/회사명/인증번호/수치/단위 등) */
  preserveOriginal: boolean;
  format: 'text' | 'number+unit';
  docx: { table: 3; row: number; col: 1 };
}

export const DISPLAY_FIELDS: DisplayField[] = [
  { key: 'itemNameModelName', label: { ko: '품목명 및 모델명', zh: '品名及型号', en: 'Item Name & Model Name' },
    help: { ko: '제품의 품목명과 전체 모델명을 정확하게 입력하세요. 모델명은 축약하지 말고 전체를 기재해야 합니다.', zh: '请准确填写产品的品名及完整型号。型号请勿缩写，需填写完整型号。', en: 'Enter the product item name and the full model name accurately. Do not abbreviate the model name.' },
    example: '실내용LED등기구 / ABC-1234-XY', required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 1, col: 1 } },
  { key: 'ratedVoltage', label: { ko: '정격 전압', zh: '额定电压', en: 'Rated Voltage' },
    help: { ko: '제품 사양서(spec)에 기재된 정격 전압을 단위와 함께 입력하세요.', zh: '请填写产品规格书上标注的额定电压，并注明单位。', en: 'Enter the rated voltage from the product datasheet, including the unit.' },
    example: '220V~240V', required: true, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 2, col: 1 } },
  { key: 'ratedPower', label: { ko: '정격 전력', zh: '额定功率', en: 'Rated Power' },
    help: { ko: '제품의 정격 소비전력을 단위(W)와 함께 입력하세요.', zh: '请填写产品的额定功率，并注明单位（W）。', en: 'Enter the rated power consumption with the unit (W).' },
    example: '40W', required: true, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 3, col: 1 } },
  { key: 'ratedCurrent', label: { ko: '정격 전류', zh: '额定电流', en: 'Rated Current' },
    help: { ko: '알 수 없으면 비워두어도 됩니다(시험 시 측정값으로 발급될 수 있습니다).', zh: '如不清楚可留空（可能以检测实测值发放证书）。', en: 'You may leave this blank if unknown (the certificate may be issued using the measured test value).' },
    example: '0.2A', required: false, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 4, col: 1 } },
  { key: 'ratedLuminousFlux', label: { ko: '정격 광속', zh: '额定光通量', en: 'Rated Luminous Flux' },
    help: { ko: '알 수 없으면 비워두어도 됩니다(시험 시 측정값으로 발급될 수 있습니다).', zh: '如不清楚可留空（可能以检测实测值发放证书）。', en: 'You may leave this blank if unknown (the certificate may be issued using the measured test value).' },
    example: '4400lm', required: false, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 5, col: 1 } },
  { key: 'luminousEfficacy', label: { ko: '광효율', zh: '光效', en: 'Luminous Efficacy' },
    help: { ko: '정격광속 ÷ 정격전력으로 계산된 광효율을 lm/W 단위로 입력하세요.', zh: '请填写额定光通量除以额定功率计算出的光效，单位为 lm/W。', en: 'Enter the luminous efficacy (rated flux ÷ rated power) in lm/W.' },
    example: '110lm/W', required: false, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 6, col: 1 } },
  { key: 'correlatedColorTemp', label: { ko: '상관색온도', zh: '相关色温', en: 'CCT' },
    help: { ko: 'K(켈빈) 단위의 색온도입니다. LED Package 사양서에서 확인 가능합니다.', zh: '色温单位为 K（开尔文），可在 LED 封装规格书中确认。', en: 'Color temperature in Kelvin (K). Can be found on the LED Package datasheet.' },
    example: '6500K', required: true, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 7, col: 1 } },
  { key: 'cri', label: { ko: '연색지수', zh: '显色指数', en: 'CRI' },
    help: { ko: 'Ra 값입니다. LED Package 사양서에서 확인 가능합니다.', zh: '即显色指数 Ra 值，可在 LED 封装规格书中确认。', en: 'The Ra (CRI) value. Can be found on the LED Package datasheet.' },
    example: '80', required: true, preserveOriginal: true, format: 'number+unit', docx: { table: 3, row: 8, col: 1 } },
  // 9번: 원산지/상표/제조자명/공급자명 — 4개 하위값을 한 셀에 결합
  { key: 'originMarking', label: { ko: '원산지표시(상표,제조자명,공급자명)', zh: '原产地标识(商标、制造商、供应商)', en: 'Origin Marking (Trademark/Manufacturer/Supplier)' },
    help: { ko: '아래 4개 항목(원산지/상표/제조자명/공급자명)을 각각 입력하면 자동으로 합쳐집니다.', zh: '请分别填写下方4个项目（原产地/商标/制造商/供应商），系统会自动合并。', en: 'Fill in the 4 sub-items below (origin/trademark/manufacturer/supplier) — they will be combined automatically.' },
    required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 9, col: 1 } },
  { key: 'asContact', label: { ko: 'A/S연락처', zh: '售后服务电话', en: 'A/S Contact' },
    help: { ko: '소비자가 문의할 수 있는 A/S 전화번호입니다. 라벨에 표시됩니다.', zh: '消费者可咨询的售后服务电话，将标示在产品标签上。', en: 'The A/S contact number consumers can call. This will be printed on the product label.' },
    example: '1566-2718', required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 10, col: 1 } },
  { key: 'manufactureDate', label: { ko: '제조연월', zh: '制造年月', en: 'Manufacture Date' },
    help: { ko: '예시 형식을 참고해 연도.월 형식으로 입력하세요.', zh: '请参考示例格式，按"年.月"格式填写。', en: 'Please use the year.month format shown in the example.' },
    example: '2026.08', required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 11, col: 1 } },
  { key: 'fixtureKsKcNo', label: { ko: '등기구 KS 또는 KC 인증번호', zh: '灯具 KS 或 KC 认证编号', en: 'Fixture KS/KC Cert No.' },
    help: { ko: '실내용 LED등기구는 필수입니다. 아직 인증이 진행 중이면 KTR 접수번호를 기재하세요.', zh: '室内用LED灯具为必填项。如认证仍在进行中，请填写KTR受理编号。', en: 'Required for indoor LED fixtures. If certification is still in progress, enter the KTR receipt number.' },
    example: 'KS C 7653 제12-1718호', required: false, preserveOriginal: true, format: 'text', docx: { table: 3, row: 12, col: 1 } },
  { key: 'converterKsKcNo', label: { ko: '컨버터 KS 또는 KC 인증번호', zh: '驱动电源 KS 或 KC 认证编号', en: 'Converter KS/KC Cert No.' },
    help: { ko: '컨버터가 없는 제품이면 "-"로 입력하세요.', zh: '如产品无驱动电源，请填写"-"。', en: 'If the product has no converter, enter "-".' },
    example: '-', required: false, preserveOriginal: true, format: 'text', docx: { table: 3, row: 13, col: 1 } },
  // 15번: 직렬/병렬/총수량 — 3개 하위값을 한 셀에 결합
  { key: 'ledPackageArrayTotal', label: { ko: '등기구 전체 LED Package 배열', zh: '灯具整体 LED 封装排列', en: 'Total LED Package Array' },
    help: { ko: '아래 직렬수×병렬수=총수량 3개 항목을 입력하면 자동으로 합쳐집니다. 예: 12직렬 × 10병렬 = 총 120개.', zh: '请分别填写下方"直列数×并列数=总数量"3个项目，系统会自动合并。例：12串 × 10并 = 共120个。', en: 'Fill in the series count × parallel count = total count below — they will be combined automatically. Example: 12 in series × 10 in parallel = 120 total.' },
    required: true, preserveOriginal: true, format: 'text', docx: { table: 3, row: 14, col: 1 } },
];

// 9번 항목의 하위 구조 (웹 폼에서는 분리 입력 → DOCX 저장 시 결합)
export const ORIGIN_MARKING_SUBFIELDS = ['originCountry', 'trademark', 'manufacturerName', 'supplierName'] as const;
// 15번 항목의 하위 구조
export const LED_ARRAY_SUBFIELDS = ['ledSeriesCount', 'ledParallelCount', 'ledTotalCount'] as const;
// (원본 예시 값 "직렬: 1S병렬:P", "중국(금호조명등구(상숙)유한공사)" 형식을 그대로 따름)

export const SUBFIELD_META: Record<string, { label: I18nText; help?: I18nText; example?: string }> = {
  originCountry: { label: { ko: '원산지', zh: '原产地', en: 'Country of Origin' }, example: '중국(China)' },
  trademark: { label: { ko: '상표', zh: '商标', en: 'Trademark' }, help: { ko: '없으면 비워두세요.', zh: '如无可留空。', en: 'Leave blank if none.' }, example: 'ABC' },
  manufacturerName: { label: { ko: '제조자명', zh: '制造商名称', en: 'Manufacturer Name' }, example: 'ABC Lighting Co., Ltd.' },
  supplierName: { label: { ko: '공급자명', zh: '供应商名称', en: 'Supplier Name' }, help: { ko: '보통 이 제품을 한국에 공급하는 귀사명입니다.', zh: '通常为向韩国供应本产品的贵公司名称。', en: 'Usually your company name as the supplier of this product to Korea.' }, example: 'ABC Lighting Co., Ltd.' },
  ledSeriesCount: { label: { ko: '직렬 수', zh: '直列数（串联）', en: 'Series Count' }, help: { ko: 'LED 회로도에서 직렬로 연결된 LED Package 개수입니다.', zh: 'LED电路图中串联连接的LED封装数量。', en: 'The number of LED Packages connected in series on the circuit.' }, example: '12' },
  ledParallelCount: { label: { ko: '병렬 수', zh: '并列数（并联）', en: 'Parallel Count' }, help: { ko: 'LED 회로도에서 병렬로 연결된 줄(라인) 수입니다.', zh: 'LED电路图中并联连接的支路数量。', en: 'The number of parallel lines/branches on the circuit.' }, example: '10' },
  ledTotalCount: { label: { ko: '총 수량', zh: '总数量', en: 'Total Count' }, help: { ko: '직렬 수 × 병렬 수와 반드시 일치해야 합니다.', zh: '必须等于"直列数 × 并列数"。', en: 'Must equal Series Count × Parallel Count.' }, example: '120' },
};

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
/**
 * 일체형 컨버터를 처음 선택했을 때 화면에 자동으로 채워지는 "예시" 행들 — 흔히 쓰이는
 * 컨버터 내부 부품 구성을 미리 보여줘서 작성자가 참고하여 수정하거나, 필요 없으면
 * 그대로 지울 수 있게 한다. (요청사항: "기본적으로 쓰는 것을 몇 개 넣어주고 예시라고
 * 표시, 지우거나 삭제할 수 있도록")
 */
export interface ConverterPartExample { partName: string; modelName: string; specText: string; qty: string; manufacturer: string }
export const CONVERTER_PART_EXAMPLES: ConverterPartExample[] = [
  { partName: '컨버터PCB', modelName: '(예시) 작성 필요', specText: 'CEM-3, 1.0mm', qty: '1', manufacturer: '(예시) 제조사명 입력' },
  { partName: 'FUSE', modelName: '(예시) 작성 필요', specText: '2A 250V', qty: '1', manufacturer: '(예시) 제조사명 입력' },
  { partName: 'X-CAPACITOR', modelName: '(예시) 작성 필요', specText: '0.1uF 275V-AC', qty: '1', manufacturer: '(예시) 제조사명 입력' },
  { partName: 'Y-CAPACITOR', modelName: '(예시) 작성 필요', specText: '222M/400V', qty: '2', manufacturer: '(예시) 제조사명 입력' },
  { partName: 'Varistor', modelName: '(예시) 작성 필요', specText: '471_VAC:300V', qty: '1', manufacturer: '(예시) 제조사명 입력' },
  { partName: 'Transformer', modelName: '(예시) 작성 필요', specText: 'EFD25', qty: '1', manufacturer: '(예시) 제조사명 입력' },
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
  help?: I18nText;
  required: boolean | 'conditional';
  visibleWhen: ConverterType[] | 'always';
  accept: 'pdf';
  isImageInsertTarget?: { table: 7 | 8 | 9 | 10 };
}

const CIRCUIT_DIAGRAM_HELP: I18nText = {
  ko: 'LED가 직렬·병렬로 연결된 형태와 개수가 명확히 보이는 회로도를 첨부하세요. (예: 3직렬×2병렬 구조가 표시된 도면)',
  zh: '请上传能清楚显示LED串联·并联连接方式及数量的电路图。（例：显示3串×2并结构的图纸）',
  en: 'Attach a circuit diagram that clearly shows how the LEDs are connected in series/parallel and their quantity (e.g., a drawing showing a 3-series × 2-parallel layout).',
};
const PCB_PATTERN_HELP: I18nText = {
  ko: '실제 PCB 기판의 배치(패턴) 도면을 첨부하세요. 부품 위치와 배선을 확인할 수 있어야 합니다.',
  zh: '请上传实际PCB电路板的布局（版图）图纸，需能确认元件位置及走线。',
  en: 'Attach the actual PCB layout drawing. Component positions and traces should be identifiable.',
};

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
  { key: 'led_module_circuit_a', label: { ko: 'LED 모듈 회로도', zh: 'LED模块电路图', en: 'LED Module Circuit Diagram' }, help: CIRCUIT_DIAGRAM_HELP, required: true, visibleWhen: ['has_converter'], accept: 'pdf', isImageInsertTarget: { table: 7 } },
  { key: 'led_module_pcb_a', label: { ko: 'LED 모듈 PCB 패턴도', zh: 'LED模块PCB版图', en: 'LED Module PCB Pattern' }, help: PCB_PATTERN_HELP, required: true, visibleWhen: ['has_converter'], accept: 'pdf', isImageInsertTarget: { table: 8 } },
  { key: 'converter_circuit', label: { ko: '컨버터 회로도', zh: '驱动电源电路图', en: 'Converter Circuit Diagram' }, help: CIRCUIT_DIAGRAM_HELP, required: true, visibleWhen: ['has_converter'], accept: 'pdf', isImageInsertTarget: { table: 10 } },
  { key: 'converter_pcb', label: { ko: '컨버터 PCB 패턴도', zh: '驱动电源PCB版图', en: 'Converter PCB Pattern' }, help: PCB_PATTERN_HELP, required: true, visibleWhen: ['has_converter'], accept: 'pdf', isImageInsertTarget: { table: 10 } },
  { key: 'converter_parts_list_pdf', label: { ko: '컨버터 부품 리스트', zh: '驱动电源部件清单', en: 'Converter Parts List' }, required: false, visibleWhen: ['has_converter'], accept: 'pdf' },
  { key: 'etc_converter', label: { ko: '기타 컨버터 관련 자료', zh: '其他驱动电源相关资料', en: 'Other Converter Documents' }, required: false, visibleWhen: ['has_converter'], accept: 'pdf' },

  // 컨버터 없음
  { key: 'fixture_circuit', label: { ko: '등기구 전체 회로도', zh: '灯具整体电路图', en: 'Fixture Overall Circuit Diagram' }, help: CIRCUIT_DIAGRAM_HELP, required: true, visibleWhen: ['no_converter'], accept: 'pdf', isImageInsertTarget: { table: 7 } },
  { key: 'fixture_pcb', label: { ko: '등기구 전체 PCB 패턴도', zh: '灯具整体PCB版图', en: 'Fixture Overall PCB Pattern' }, help: PCB_PATTERN_HELP, required: true, visibleWhen: ['no_converter'], accept: 'pdf', isImageInsertTarget: { table: 8 } },
  { key: 'led_module_circuit_b', label: { ko: 'LED 모듈 회로도', zh: 'LED模块电路图', en: 'LED Module Circuit Diagram' }, help: CIRCUIT_DIAGRAM_HELP, required: true, visibleWhen: ['no_converter'], accept: 'pdf' },
  { key: 'led_module_pcb_b', label: { ko: 'LED 모듈 PCB 패턴도', zh: 'LED模块PCB版图', en: 'LED Module PCB Pattern' }, help: PCB_PATTERN_HELP, required: true, visibleWhen: ['no_converter'], accept: 'pdf' },
  { key: 'etc_fixture_no_conv', label: { ko: '기타 등기구 관련 자료', zh: '其他灯具相关资料', en: 'Other Fixture Documents' }, required: false, visibleWhen: ['no_converter'], accept: 'pdf' },

  // 일체형 컨버터
  { key: 'fixture_circuit_int', label: { ko: '등기구 전체 회로도', zh: '灯具整体电路图', en: 'Fixture Overall Circuit Diagram' }, help: CIRCUIT_DIAGRAM_HELP, required: true, visibleWhen: ['integrated'], accept: 'pdf', isImageInsertTarget: { table: 7 } },
  { key: 'fixture_pcb_int', label: { ko: '등기구 전체 PCB 패턴도', zh: '灯具整体PCB版图', en: 'Fixture Overall PCB Pattern' }, help: PCB_PATTERN_HELP, required: true, visibleWhen: ['integrated'], accept: 'pdf', isImageInsertTarget: { table: 8 } },
  { key: 'led_module_circuit_int', label: { ko: 'LED 모듈 회로도', zh: 'LED模块电路图', en: 'LED Module Circuit Diagram' }, help: CIRCUIT_DIAGRAM_HELP, required: true, visibleWhen: ['integrated'], accept: 'pdf' },
  { key: 'led_module_pcb_int', label: { ko: 'LED 모듈 PCB 패턴도', zh: 'LED模块PCB版图', en: 'LED Module PCB Pattern' }, help: PCB_PATTERN_HELP, required: true, visibleWhen: ['integrated'], accept: 'pdf' },
  { key: 'converter_circuit_int', label: { ko: '컨버터 회로도', zh: '驱动电源电路图', en: 'Converter Circuit Diagram' }, help: CIRCUIT_DIAGRAM_HELP, required: true, visibleWhen: ['integrated'], accept: 'pdf', isImageInsertTarget: { table: 10 } },
  { key: 'converter_pcb_int', label: { ko: '컨버터 PCB 패턴도', zh: '驱动电源PCB版图', en: 'Converter PCB Pattern' }, help: PCB_PATTERN_HELP, required: true, visibleWhen: ['integrated'], accept: 'pdf', isImageInsertTarget: { table: 10 } },
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
