export type Lang = 'ko' | 'zh' | 'en';

/** 사전승인서/출고선적승인서 — 테이블은 공유하고 이 값 하나로 구분한다(§1/§20). */
export type ReportType = 'pre_approval' | 'pre_shipment';

export const REPORT_TYPE_TITLE: Record<ReportType, Record<Lang, string>> = {
  pre_approval: { ko: '제품 사전승인서', zh: '产品预批准报告', en: 'Product Pre-approval Report' },
  pre_shipment: { ko: '제품 출고·선적 승인서', zh: '出货前批准报告', en: 'Pre-shipment Approval Report' },
};

/** §15 최종 판정값 — 승인서 종류에 따라 다른 목록을 쓴다. */
export const FINAL_DECISION_OPTIONS: Record<ReportType, string[]> = {
  pre_approval: ['승인', '조건부 승인', '수정 후 재제출', '부적합'],
  pre_shipment: ['출고 승인', '선적 승인', '조건부 출고 승인', '출고 보류', '부적합'],
};

/** §7 측정항목 판정값 — 자동으로 최종 확정하지 않고 추천값만 계산한다(§7 요구사항). */
export type MeasurementJudgement = '적합' | '부적합' | '조건부 승인' | '재검사 필요' | '해당 없음';

/** §11 외관/부품 비교 판정값. */
export type DiffJudgement = '동일' | '허용 가능한 차이' | '승인되지 않은 변경' | '확인 필요' | '해당 없음';

export type ProjectStatus =
  | 'draft' | 'submitted' | 'revision_requested' | 'revising' | 'resubmitted'
  | 'internal_review' | 'approved' | 'conditional_approval' | 'shipment_hold' | 'closed';

/** §3 프로젝트 기본정보 — 승인서 종류에 따라 일부 필드의 필수/선택 여부만 다르고
 * 구조는 완전히 동일하다(공통 시스템 원칙). */
export interface InspectionProject {
  id: string;
  businessId: string;
  reportType: ReportType;
  titleOverride: string | null;
  projectName: string;
  internalRefNo: string | null;
  customerName: string | null;
  supplierName: string | null;
  manufacturerName: string | null;
  productCategory: string | null;
  productName: string | null;
  baseModelName: string | null;
  poNumber: string | null;
  piNumber: string | null;
  productionLotNo: string | null;
  productionQty: number | null;
  inspectionQty: number | null;
  shipDate: string | null;
  shippingDate: string | null;
  requestDate: string | null;
  dueDate: string | null;
  internalContact: string | null;
  supplierContact: string | null;
  memo: string | null;
  referenceProjectId: string | null;
  defaultLanguage: Lang;
  status: ProjectStatus;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** §6 제품 기본정보 — 전기적 측정항목은 여기 컬럼으로 두지 않고 InspectionMeasurement
 * 행으로 저장한다(참고 엑셀이 항목마다 컬럼을 만들어 A4 폭을 넘긴 문제를 근본적으로
 * 피하기 위한 설계 — Context 참고). */
export interface InspectionProduct {
  id: string;
  projectId: string;
  sortOrder: number;
  productCategory: string | null;
  productName: string | null;
  modelName: string | null;
  manufacturer: string | null;
  productionLot: string | null;
  dimensions: string | null;
  weightG: string | null;
  certNumber: string | null;
  remark: string | null;
  overallJudgement: string | null;
  internalOpinion: string | null;
}

/** §7 측정항목 — 사전승인서에서는 baselineValue가 "승인 기준값"이고, 출고선적승인서에서는
 * 스냅샷 복사된 사전승인 값이 baselineValue, 실제 출고품 측정값이 measuredValue다. */
export interface InspectionMeasurement {
  id: string;
  projectId: string;
  productId: string;
  itemKey: string;
  itemLabel: string;
  baselineValue: string | null;
  baselineUnit: string | null;
  measuredValue: string | null;
  measuredUnit: string | null;
  minValue: string | null;
  maxValue: string | null;
  tolerance: string | null;
  equipment: string | null;
  measuredDate: string | null;
  measuredBy: string | null;
  judgement: MeasurementJudgement | null;
  remark: string | null;
  sortOrder: number;
}

/** §6 표준 측정항목 키 — GLM/기존 코드가 아니라 참고 엑셀(Driver Pre-approval Report.xlsx)
 * 헤더(Watt/IN mA/PF/OUT V/OUT A/OUT Vmax/Insulation resistance)를 그대로 매핑한
 * 기본 세트. 프로젝트마다 이 목록으로 초기 행을 만들어주되, 사용자가 자유롭게 추가/삭제 가능. */
export const STANDARD_MEASUREMENT_ITEMS: { key: string; label: string; unit: string }[] = [
  { key: 'rated_input_voltage', label: '정격입력전압', unit: 'V' },
  { key: 'rated_frequency', label: '정격주파수', unit: 'Hz' },
  { key: 'rated_power', label: '정격전력', unit: 'W' },
  { key: 'input_current', label: '입력전류', unit: 'mA' },
  { key: 'power_factor', label: '역률', unit: '' },
  { key: 'output_voltage', label: '출력전압', unit: 'V' },
  { key: 'output_current', label: '출력전류', unit: 'A' },
  { key: 'output_voltage_max', label: '최대 출력전압', unit: 'V' },
  { key: 'insulation_resistance', label: '절연저항', unit: 'MΩ' },
  { key: 'insulation_withstand', label: '절연내력', unit: '' },
  { key: 'output_ripple', label: '출력 리플', unit: 'mV' },
  { key: 'efficiency', label: '효율', unit: '%' },
  { key: 'tc_temperature', label: 'Tc 온도', unit: '℃' },
];

export type WireRole = 'input' | 'output';
export type LengthUnit = 'mm' | 'cm' | 'm';

/** §10 입력선/출력선. */
export interface InspectionWireSpec {
  id: string;
  projectId: string;
  productId: string;
  wireRole: WireRole;
  wireSpec: string | null;
  conductorArea: string | null;
  coreCount: string | null;
  insulationMaterial: string | null;
  color: string | null;
  baselineLengthValue: string | null;
  baselineLengthUnit: LengthUnit;
  measuredLengthValue: string | null;
  measuredLengthUnit: LengthUnit;
  stripLength: string | null;
  endTreatment: string | null;
  connectorManufacturer: string | null;
  connectorModel: string | null;
  pinCount: string | null;
  polarity: string | null;
  remark: string | null;
  sortOrder: number;
}

/** §9 사진 카테고리 — 기본/PCB/배선·커넥터 3그룹. */
export const PHOTO_CATEGORIES: { key: string; group: 'product' | 'pcb' | 'wiring'; label: Record<Lang, string> }[] = [
  { key: 'product_top', group: 'product', label: { ko: '제품 전체 상면', zh: '产品整体上面', en: 'Product Overall (Top)' } },
  { key: 'product_bottom', group: 'product', label: { ko: '제품 전체 하면', zh: '产品整体下面', en: 'Product Overall (Bottom)' } },
  { key: 'product_front', group: 'product', label: { ko: '제품 정면', zh: '产品正面', en: 'Product Front' } },
  { key: 'product_side', group: 'product', label: { ko: '제품 측면', zh: '产品侧面', en: 'Product Side' } },
  { key: 'product_label', group: 'product', label: { ko: '제품 라벨', zh: '产品标签', en: 'Product Label' } },
  { key: 'product_cert_mark', group: 'product', label: { ko: '제품 인증표시', zh: '产品认证标志', en: 'Product Certification Mark' } },
  { key: 'pcb_top', group: 'pcb', label: { ko: "PCB Ass'y 상면", zh: 'PCB组件上面', en: "PCB Ass'y Top" } },
  { key: 'pcb_bottom', group: 'pcb', label: { ko: "PCB Ass'y 하면", zh: 'PCB组件下面', en: "PCB Ass'y Bottom" } },
  { key: 'pcb_overall', group: 'pcb', label: { ko: 'PCB 전체 이미지', zh: 'PCB整体图像', en: 'PCB Overall Image' } },
  { key: 'pcb_component_closeup', group: 'pcb', label: { ko: '주요부품 확대 이미지', zh: '主要部件放大图', en: 'Key Component Closeup' } },
  { key: 'input_wire_overall', group: 'wiring', label: { ko: '입력선 전체', zh: '输入线整体', en: 'Input Wire Overall' } },
  { key: 'input_wire_length', group: 'wiring', label: { ko: '입력선 길이 측정', zh: '输入线长度测量', en: 'Input Wire Length' } },
  { key: 'output_wire_overall', group: 'wiring', label: { ko: '출력선 전체', zh: '输出线整体', en: 'Output Wire Overall' } },
  { key: 'output_wire_length', group: 'wiring', label: { ko: '출력선 길이 측정', zh: '输出线长度测量', en: 'Output Wire Length' } },
  { key: 'input_connector', group: 'wiring', label: { ko: '입력 커넥터', zh: '输入连接器', en: 'Input Connector' } },
  { key: 'output_connector', group: 'wiring', label: { ko: '출력 커넥터', zh: '输出连接器', en: 'Output Connector' } },
  { key: 'ground_wire', group: 'wiring', label: { ko: '접지선', zh: '接地线', en: 'Ground Wire' } },
  { key: 'other_wire', group: 'wiring', label: { ko: '기타 배선', zh: '其他布线', en: 'Other Wiring' } },
];

export interface InspectionPhoto {
  id: string;
  projectId: string;
  productId: string;
  sampleId: string | null;
  categoryKey: string;
  originalFilename: string;
  storedFilename: string;
  sizeBytes: number;
  mimeType: string | null;
  description: string | null;
  cropRect: { x: number; y: number; w: number; h: number } | null;
  rotationDeg: 0 | 90 | 180 | 270;
  editedFilePath: string | null;
  isCurrent: boolean;
  sortOrder: number;
}

/** §12 샘플 — 헤더 하나에 여러 측정항목 값이 붙는다(평균/최소/최대는 조회 시 계산). */
export interface InspectionSample {
  id: string;
  projectId: string;
  productId: string;
  sampleNo: string;
  samplingMethod: string | null;
  inspectionDate: string | null;
  inspectionPlace: string | null;
  inspector: string | null;
  remark: string | null;
}
export interface SampleMeasurement {
  id: string;
  sampleId: string;
  itemKey: string;
  itemLabel: string;
  measuredValue: string | null;
  unit: string | null;
  judgement: string | null;
}

/** §11 외관/부품 비교. */
export interface InspectionDiff {
  id: string;
  projectId: string;
  productId: string;
  compareItem: string;
  judgement: DiffJudgement | null;
  changeLocation: string | null;
  beforeDesc: string | null;
  afterDesc: string | null;
  reason: string | null;
  needsApproval: boolean;
  supplierExplanation: string | null;
  internalReviewOpinion: string | null;
  relatedPhotoIds: string[];
}

/** §11 비교 대상 표준 목록. */
export const DIFF_COMPARE_ITEMS = [
  '제품 외관', '제품 크기', '제품 라벨', 'PCB 상면', 'PCB 하면',
  '주요부품', '입력선', '출력선', '커넥터', '전선 색상', '부품 배치', '납땜 상태',
];
