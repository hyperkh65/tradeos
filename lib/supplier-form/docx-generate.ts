import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import {
  replaceCellText, toggleGlyphCheckbox, setCheckmarkCell, appendClonedRow, replaceParagraphValueAfterPrefix,
  findNthElement, buildCellWithText, extractCellFormatting,
} from './docx-xml';
import {
  DISPLAY_FIELDS, BASE_MODEL_INFO_FIELDS, TEST_CATEGORY_OPTIONS, DERIVED_CHANGE_ITEMS,
  FIXTURE_PART_FIXED_ROWS, CONVERTER_PART_TABLE_DOCX, MULTI_COMPONENT_TABLE_DOCX,
  ATTACHMENT_CATEGORIES, getDisplayFieldValue, type ConverterType, type TranslatableValue,
} from './field-schema';
import { insertImageIntoCell } from './docx-image';

export interface ComponentItemInput {
  listType: string; rowKey: string | null;
  modelName: string | null; specText: string | null; material: string | null;
  widthMm: string | null; depthMm: string | null; heightMm: string | null;
  qty: string | null; manufacturer: string | null; remark: string | null;
  partName?: string | null;
}
export interface AttachmentInput {
  categoryKey: string; absolutePath: string; imagePageSelection?: number | null;
}
export interface GenerateDocxInput {
  templateVersion: string;
  converterType: ConverterType | null;
  testCategories: string[];
  derivedChangeChecks: Record<string, boolean>;
  formData: Record<string, TranslatableValue>;
  componentItems: ComponentItemInput[];
  attachments: AttachmentInput[];
}

function templatePath(version: string) {
  return path.join(process.cwd(), 'public/templates/supplier-form', `hee-cert-request-${version}.docx`);
}

const CELL_ORDER: (keyof NonNullable<typeof FIXTURE_PART_FIXED_ROWS[number]['cells']>)[] = [
  'modelName', 'specText', 'material', 'width', 'depth', 'height', 'qty', 'manufacturer', 'remark',
];

function fillFixtureParts(xml: string, items: ComponentItemInput[]): string {
  let result = xml;
  for (const row of FIXTURE_PART_FIXED_ROWS) {
    const item = items.find(i => i.rowKey === row.rowKey);
    const get = (key: 'modelName' | 'specText' | 'material' | 'width' | 'depth' | 'height' | 'qty' | 'manufacturer' | 'remark') => {
      if (!item) return '';
      const map: Record<string, string | null | undefined> = {
        modelName: item.modelName, specText: item.specText, material: item.material,
        width: item.widthMm, depth: item.depthMm, height: item.heightMm,
        qty: item.qty, manufacturer: item.manufacturer, remark: item.remark,
      };
      return map[key] || '';
    };
    for (const key of CELL_ORDER) {
      const cellIdx = row.cells[key];
      if (cellIdx === undefined) continue;
      const value = key === 'material' && get('material') ? `재질: ${get('material')}` : get(key);
      result = replaceCellText(result, row.docx.table, row.docx.row, cellIdx, value);
    }
  }
  return result;
}

/** 표5(컨버터 내부 부품)/표6(복수부품) 공용: 부품명/형명/명세/수량/제조회사/비고 6열 반복 리스트 */
function fillRepeatableList(
  xml: string, tableIndex: number, items: ComponentItemInput[],
  opts: { firstDataRow: number; templateRowCount: number },
): string {
  let result = xml;
  const rowCells = (item: ComponentItemInput | undefined) => [
    item?.partName || '', item?.modelName || '', item?.specText || '', item?.qty || '', item?.manufacturer || '', item?.remark || '',
  ];

  // 1) 템플릿에 이미 존재하는 행(firstDataRow..firstDataRow+templateRowCount-1)을 전부 덮어쓴다
  //    — 참고용 원본 데이터(예: 실제 부품 형명/제조사)가 새 문서에 절대 남지 않도록 항목이
  //    없는 행도 반드시 빈 값으로 초기화한다.
  for (let i = 0; i < opts.templateRowCount; i++) {
    const rowIdx = opts.firstDataRow + i;
    const values = rowCells(items[i]);
    for (let c = 0; c < 6; c++) {
      result = replaceCellText(result, tableIndex, rowIdx, c, values[c]);
    }
  }

  // 2) 템플릿 행 수를 초과하는 항목은 마지막 템플릿 행 서식을 복제해서 추가
  if (items.length > opts.templateRowCount) {
    const lastTemplateRow = opts.firstDataRow + opts.templateRowCount - 1;
    let insertAfter = lastTemplateRow;
    for (let i = opts.templateRowCount; i < items.length; i++) {
      const values = rowCells(items[i]);
      result = appendClonedRow(result, tableIndex, lastTemplateRow, insertAfter, values, i === opts.templateRowCount);
      insertAfter++;
    }
  }
  return result;
}

/** 이미지 삽입 대상 셀(표7~10)에서 기존 원본(참고 샘플) 이미지를 지우고 자리를 비운다.
 * 새 이미지를 못 넣는 경우에도 원본 참고 도면이 그대로 남아있으면 안 되므로 항상 먼저 비운다. */
function clearImageCell(xml: string, tableIndex: number): string {
  const tbl = findNthElement(xml, 'w:tbl', tableIndex - 1);
  if (!tbl) return xml;
  const tr = findNthElement(xml, 'w:tr', 0, tbl.start, tbl.end);
  if (!tr) return xml;
  const tc = findNthElement(xml, 'w:tc', 0, tr.start, tr.end);
  if (!tc) return xml;
  const cellXml = xml.slice(tc.start, tc.end);
  const fmt = extractCellFormatting(cellXml);
  const newCell = buildCellWithText(fmt, '(첨부파일 별도 확인)');
  return xml.slice(0, tc.start) + newCell + xml.slice(tc.end);
}

export async function generateSupplierFormDocx(input: GenerateDocxInput): Promise<Buffer> {
  const templateBuf = fs.readFileSync(templatePath(input.templateVersion));
  const zip = await JSZip.loadAsync(templateBuf);
  let xml = await zip.file('word/document.xml')!.async('string');

  const kv = (key: string) => input.formData[key]?.korean || input.formData[key]?.original || '';

  // 표1: 시험 구분 체크박스
  for (const opt of TEST_CATEGORY_OPTIONS) {
    xml = toggleGlyphCheckbox(xml, 1, 0, opt.docx.col, input.testCategories.includes(opt.key));
  }

  // 기본모델 발행기관/발행일/번호 (본문 문단)
  for (const f of BASE_MODEL_INFO_FIELDS) {
    xml = replaceParagraphValueAfterPrefix(xml, f.docx.matchPrefix, kv(f.key) || '-');
  }

  // 표2: 파생/변경 항목 확인 체크
  for (const item of DERIVED_CHANGE_ITEMS) {
    xml = setCheckmarkCell(xml, 2, item.docx.row, item.docx.checkCol, !!input.derivedChangeChecks[item.key]);
  }

  // 표3: 표시사항 15개 항목
  for (const f of DISPLAY_FIELDS) {
    xml = replaceCellText(xml, 3, f.docx.row, f.docx.col, getDisplayFieldValue(f.key, kv));
  }

  // 표4: 등기구 부품 리스트 (고정 8행 전부 재기입 — 미입력 행은 공란으로 초기화)
  xml = fillFixtureParts(xml, input.componentItems.filter(c => c.listType === 'fixture_part'));

  // 표5: 컨버터 내부 부품 (일체형일 때만 실제 값, 아니면 전부 공란 처리)
  const converterItems = input.converterType === 'integrated' ? input.componentItems.filter(c => c.listType === 'converter_part') : [];
  xml = fillRepeatableList(xml, CONVERTER_PART_TABLE_DOCX.table, converterItems, { firstDataRow: CONVERTER_PART_TABLE_DOCX.firstDataRow, templateRowCount: 8 });

  // 표6: 복수부품
  const multiItems = input.componentItems.filter(c => c.listType === 'multi_component');
  xml = fillRepeatableList(xml, MULTI_COMPONENT_TABLE_DOCX.table, multiItems, { firstDataRow: MULTI_COMPONENT_TABLE_DOCX.firstDataRow, templateRowCount: 2 });

  // 표7~10: 회로도/PCB패턴도/구조도 이미지 — 항상 먼저 원본 참고이미지를 비우고, 가능하면 새 이미지로 교체
  const imageTargetTables = [7, 8, 9, 10] as const;
  for (const t of imageTargetTables) xml = clearImageCell(xml, t);

  for (const cat of ATTACHMENT_CATEGORIES) {
    if (!cat.isImageInsertTarget) continue;
    const att = input.attachments.find(a => a.categoryKey === cat.key);
    if (!att) continue;
    try {
      const result = await insertImageIntoCell(zip, xml, cat.isImageInsertTarget.table, att.absolutePath, att.imagePageSelection || 1);
      if (result) xml = result;
    } catch (e) {
      console.error(`[docx-generate] 이미지 삽입 실패 (${cat.key}):`, e);
      // 실패해도 문서 생성 자체는 계속 진행 — 원본 참고이미지는 이미 지워진 상태로 안전하게 유지됨
    }
  }

  zip.file('word/document.xml', xml);
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return out;
}
