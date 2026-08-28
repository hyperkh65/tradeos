import type { BuiltinSectionType, I18nText } from './types';

/**
 * "표 형태로 입력하는 섹션"들을 하나의 제네릭 API 라우트/화면 컴포넌트로 처리하기 위한
 * 매핑 테이블. Phase 2에서 만든 각 전용 DB 테이블(dimension_items, packing_items 등)을
 * section_type별로 어떤 컬럼 구성으로 노출할지 여기서 한 번에 정의한다 — 섹션마다
 * 별도 API 라우트/폼 컴포넌트를 새로 만들지 않기 위한 설계.
 *
 * columns의 key는 클라이언트가 주고받는 필드명이자 DB 컬럼명(스네이크→카멜 변환은
 * 라우트가 처리)이다. type='number'는 화면에서 숫자 입력, 나머지는 텍스트.
 */
export interface TableColumnDef {
  key: string;
  label: I18nText;
  type?: 'text' | 'number' | 'date';
  width?: string;
}

export interface TableSectionConfig {
  dbTable: string;
  /** component_items처럼 한 테이블을 여러 섹션이 나눠 쓸 때 고정으로 넣는 판별 컬럼 */
  fixedValues?: Record<string, string>;
  columns: TableColumnDef[];
}

const TR = (ko: string, zh: string, en: string): I18nText => ({ ko, zh, en });

export const TABLE_SECTION_CONFIG: Partial<Record<BuiltinSectionType, TableSectionConfig>> = {
  product_dimension: {
    dbTable: 'approval_doc_dimension_items',
    columns: [
      { key: 'item_label', label: TR('항목', '项目', 'Item') },
      { key: 'value_mm_original', label: TR('치수(mm)', '尺寸(mm)', 'Dimension (mm)') },
      { key: 'tolerance_original', label: TR('공차', '公差', 'Tolerance') },
      { key: 'weight_g_original', label: TR('중량(g)', '重量(g)', 'Weight (g)') },
    ],
  },
  packing_spec: {
    dbTable: 'approval_doc_packing_items',
    columns: [
      { key: 'packing_type', label: TR('구분(label/packing)', '类型(label/packing)', 'Type (label/packing)') },
      { key: 'field_key', label: TR('항목', '项目', 'Field') },
      { key: 'value_original', label: TR('값', '值', 'Value') },
    ],
  },
  evaluation_test: {
    dbTable: 'approval_doc_test_items',
    columns: [
      { key: 'test_category', label: TR('시험 종류', '测试种类', 'Test Category') },
      { key: 'item_label', label: TR('시험 항목', '测试项目', 'Item') },
      { key: 'spec_value_original', label: TR('적용 기준', '适用基准', 'Applied Standard') },
      { key: 'measured_value_original', label: TR('측정 결과', '测量结果', 'Measured Result') },
      { key: 'unit', label: TR('단위', '单位', 'Unit') },
      { key: 'pass_fail', label: TR('합격/불합격', '合格/不合格', 'Pass/Fail') },
    ],
  },
  outgoing_inspection: {
    dbTable: 'approval_doc_test_items',
    columns: [
      { key: 'test_category', label: TR('검사 구분', '检验类别', 'Inspection Type') },
      { key: 'item_label', label: TR('검사 항목', '检验项目', 'Inspection Item') },
      { key: 'spec_value_original', label: TR('검사 기준', '检验基准', 'Criteria') },
      { key: 'sampling_criteria', label: TR('샘플링 기준', '抽样基准', 'Sampling') },
      { key: 'equipment', label: TR('검사 장비', '检验设备', 'Equipment') },
      { key: 'measured_value_original', label: TR('측정값', '测量值', 'Measured') },
      { key: 'pass_fail', label: TR('결과', '结果', 'Result') },
      { key: 'inspector', label: TR('검사자', '检验员', 'Inspector') },
      { key: 'inspection_date', label: TR('검사일자', '检验日期', 'Date'), type: 'date' },
    ],
  },
  certification: {
    dbTable: 'approval_doc_certification_items',
    columns: [
      { key: 'cert_type', label: TR('인증 종류', '认证种类', 'Certification') },
      { key: 'cert_number', label: TR('인증번호', '认证编号', 'Cert No.') },
      { key: 'issuing_body', label: TR('인증기관', '认证机构', 'Issuing Body') },
      { key: 'issue_date', label: TR('발행일', '发行日期', 'Issue Date'), type: 'date' },
      { key: 'expiry_date', label: TR('만료일', '有效期至', 'Expiry Date'), type: 'date' },
    ],
  },
  key_component: {
    dbTable: 'approval_doc_component_items',
    fixedValues: { list_type: 'key_component' },
    columns: [
      { key: 'part_name', label: TR('부품명', '部件名称', 'Part') },
      { key: 'model_name', label: TR('형명', '型号', 'Model') },
      { key: 'spec_text', label: TR('주요 사양', '主要规格', 'Spec') },
      { key: 'manufacturer', label: TR('제조업체', '制造商', 'Manufacturer') },
      { key: 'qty', label: TR('수량', '数量', 'Qty') },
      { key: 'remark', label: TR('비고', '备注', 'Remark') },
    ],
  },
  converter_partlist: {
    dbTable: 'approval_doc_component_items',
    fixedValues: { list_type: 'converter_bom' },
    columns: [
      { key: 'part_name', label: TR('부품명', '部件名称', 'Part') },
      { key: 'model_name', label: TR('형명', '型号', 'Model') },
      { key: 'spec_text', label: TR('정격/사양', '额定值/规格', 'Rating/Spec') },
      { key: 'material', label: TR('재질', '材质', 'Material') },
      { key: 'qty', label: TR('수량', '数量', 'Qty') },
      { key: 'manufacturer', label: TR('제조업체', '制造商', 'Manufacturer') },
      { key: 'remark', label: TR('인증/비고', '认证/备注', 'Cert/Remark') },
    ],
  },
  flame_resistance: {
    dbTable: 'approval_doc_component_items',
    fixedValues: { list_type: 'flame_resistance' },
    columns: [
      { key: 'part_name', label: TR('부품명', '部件名称', 'Part') },
      { key: 'material', label: TR('재질', '材质', 'Material') },
      { key: 'manufacturer', label: TR('제조업체', '制造商', 'Manufacturer') },
      { key: 'spec_text', label: TR('난연등급/적용규격', '阻燃等级/适用标准', 'Flame Grade/Standard') },
      { key: 'remark', label: TR('인증번호/비고', '认证编号/备注', 'Cert No./Remark') },
    ],
  },
  reliability_test: {
    dbTable: 'approval_doc_test_items',
    columns: [
      { key: 'test_category', label: TR('시험명', '测试名称', 'Test Name') },
      { key: 'item_label', label: TR('적용 규격/조건', '适用标准/条件', 'Standard/Condition') },
      { key: 'spec_value_original', label: TR('판정 기준', '判定基准', 'Pass Criteria') },
      { key: 'measured_value_original', label: TR('결과', '结果', 'Result') },
      { key: 'pass_fail', label: TR('합격/불합격', '合格/不合格', 'Pass/Fail') },
    ],
  },
};

/** 첨부파일 목록만으로 구성되는 섹션 — 회로도/PCB도면/광학특성/RoHS. category는 하나의
 * 섹션 안에서 자료 종류를 구분하는 표시용 라벨일 뿐, 저장은 전부 approval_doc_attachments에
 * category_key='섹션타입:서브카테고리' 형태로 한다. */
export const ATTACHMENT_SECTION_CATEGORIES: Partial<Record<BuiltinSectionType, { key: string; label: I18nText }[]>> = {
  optical: [
    { key: 'spectral', label: TR('분광분포/색좌표', '光谱分布/色坐标', 'Spectral/Chromaticity') },
    { key: 'polar_curve', label: TR('배광곡선/광도분포', '配光曲线/光强分布', 'Polar/Intensity Curve') },
    { key: 'test_report', label: TR('적분구 시험 결과', '积分球测试结果', 'Integrating Sphere Report') },
    { key: 'other', label: TR('기타 자료', '其他资料', 'Other') },
  ],
  circuit_diagram: [
    { key: 'fixture', label: TR('등기구 전체 회로도', '灯具整体电路图', 'Fixture Circuit') },
    { key: 'led_module', label: TR('LED 모듈 회로도', 'LED模块电路图', 'LED Module Circuit') },
    { key: 'converter', label: TR('컨버터 회로도', '驱动电源电路图', 'Converter Circuit') },
    { key: 'other', label: TR('기타 회로도', '其他电路图', 'Other') },
  ],
  pcb_drawing: [
    { key: 'fixture', label: TR('등기구 PCB 패턴도', '灯具PCB版图', 'Fixture PCB Pattern') },
    { key: 'led_module', label: TR('LED 모듈 PCB 패턴도', 'LED模块PCB版图', 'LED Module PCB Pattern') },
    { key: 'converter', label: TR('컨버터 PCB 패턴도', '驱动电源PCB版图', 'Converter PCB Pattern') },
    { key: 'other', label: TR('기타 PCB 자료', '其他PCB资料', 'Other PCB Data') },
  ],
  rohs: [
    { key: 'rohs_checksheet', label: TR('RoHS 체크시트', 'RoHS检查表', 'RoHS Check Sheet') },
    { key: 'material_report', label: TR('재질 성적서', '材质检测报告', 'Material Report') },
    { key: 'reach', label: TR('Reach', 'Reach', 'Reach') },
    { key: 'other', label: TR('기타 환경자료', '其他环境资料', 'Other') },
  ],
};

/** 단순 텍스트 필드만 있는 섹션 — approval_doc_sections.data_json에 {key: TranslatableValue} 형태로 저장. */
export const SCALAR_SECTION_FIELDS: Partial<Record<BuiltinSectionType, { key: string; label: I18nText; multiline?: boolean }[]>> = {
  product_overview: [
    { key: 'description', label: TR('제품 설명', '产品说明', 'Description'), multiline: true },
    { key: 'keyFeatures', label: TR('주요 특징', '主要特点', 'Key Features'), multiline: true },
    { key: 'application', label: TR('적용 장소', '适用场所', 'Application') },
    { key: 'material', label: TR('재질', '材质', 'Material') },
    { key: 'surfaceTreatment', label: TR('표면처리', '表面处理', 'Surface Treatment') },
    { key: 'color', label: TR('색상', '颜色', 'Color') },
    { key: 'installMethod', label: TR('설치 방식', '安装方式', 'Install Method') },
    { key: 'converterConfig', label: TR('컨버터 구성', '驱动电源配置', 'Converter Configuration') },
    { key: 'precautions', label: TR('사용상 주의사항', '使用注意事项', 'Precautions'), multiline: true },
  ],
};
