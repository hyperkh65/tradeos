import ExcelJS from 'exceljs';
import { TABLE_SECTION_CONFIG } from './table-sections';
import type { BuiltinSectionType } from './types';

const B: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } };
const bAll = { top: B, left: B, bottom: B, right: B } as ExcelJS.Borders;
const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } } as ExcelJS.Fill;

/**
 * 표 섹션(치수/포장/시험/인증/부품표 등) 전체를 한 XLSX 워크북 하나로 내보낸다 — 섹션마다
 * 시트를 나누고, 각 시트는 2행 구조로 만든다: 1행=사용자에게 보이는 한글 라벨,
 * 2행(숨김)=기계 판독용 컬럼 키(table-sections.ts의 column.key 그대로). 사용자가 1행의
 * 라벨을 자유롭게 바꾸거나 순서를 바꿔도, 가져오기는 2행의 키로 컬럼을 다시 찾으므로
 * 매핑이 깨지지 않는다.
 */
export async function exportTableSectionsXlsx(
  sections: { sectionType: BuiltinSectionType; title: string; rows: Record<string, unknown>[] }[],
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'YNK 그룹웨어 — 제품 승인서';

  for (const section of sections) {
    const config = TABLE_SECTION_CONFIG[section.sectionType];
    if (!config) continue;
    const ws = wb.addWorksheet(section.title.slice(0, 31)); // 엑셀 시트명 31자 제한

    const labelRow = ws.addRow(config.columns.map(c => c.label.ko));
    labelRow.font = { bold: true };
    labelRow.eachCell(c => { c.border = bAll; c.fill = headerFill; c.alignment = { vertical: 'middle', wrapText: true }; });

    const keyRow = ws.addRow(config.columns.map(c => c.key));
    keyRow.hidden = true;
    keyRow.font = { size: 8, color: { argb: 'FFAAAAAA' } };

    for (const row of section.rows) {
      ws.addRow(config.columns.map(c => (row[c.key] ?? '') as string));
    }
    ws.columns.forEach(col => { col.width = 18; });
  }

  if (wb.worksheets.length === 0) wb.addWorksheet('빈 양식');
  return wb.xlsx.writeBuffer();
}

/** 빈 양식(헤더+키 행만) — 공급업체가 오프라인에서 채워서 다시 올릴 수 있도록. */
export async function exportBlankTemplateXlsx(sectionType: BuiltinSectionType, title: string): Promise<ExcelJS.Buffer> {
  return exportTableSectionsXlsx([{ sectionType, title, rows: [] }]);
}

export interface XlsxImportResult {
  rows: Record<string, string>[];
  matchedColumns: string[];
  unmatchedHeaders: string[];
}

/**
 * 업로드된 XLSX에서 특정 섹션 타입의 데이터를 읽어온다. 먼저 2행(숨김 키 행)이 있으면
 * 그걸로 컬럼을 매핑하고, 없으면(사용자가 직접 만든 파일 등) 1행의 라벨 텍스트를
 * 대소문자/공백 무시하고 근사 매칭한다. 매핑 결과는 "적용 전 검토 화면"에서 보여줘야
 * 하므로 matchedColumns/unmatchedHeaders를 함께 반환한다.
 */
export async function importTableSectionXlsx(sectionType: BuiltinSectionType, buffer: Buffer, sheetName?: string): Promise<XlsxImportResult> {
  const config = TABLE_SECTION_CONFIG[sectionType];
  if (!config) throw new Error('지원하지 않는 섹션입니다.');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) throw new Error('시트를 찾을 수 없습니다.');

  const labelRow = ws.getRow(1).values as unknown[];
  const keyRowCandidate = ws.getRow(2).values as unknown[];
  const configKeys = new Set(config.columns.map(c => c.key));
  const looksLikeKeyRow = keyRowCandidate.some(v => typeof v === 'string' && configKeys.has(v));

  // colIndex(1-based) -> config column key
  const colMap = new Map<number, string>();
  const unmatchedHeaders: string[] = [];
  if (looksLikeKeyRow) {
    keyRowCandidate.forEach((v, idx) => { if (typeof v === 'string' && configKeys.has(v)) colMap.set(idx, v); });
  } else {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    const byLabel = new Map(config.columns.map(c => [norm(c.label.ko), c.key]));
    labelRow.forEach((v, idx) => {
      if (typeof v !== 'string') return;
      const key = byLabel.get(norm(v));
      if (key) colMap.set(idx, key);
      else unmatchedHeaders.push(v);
    });
  }

  const dataStartRow = looksLikeKeyRow ? 3 : 2;
  const rows: Record<string, string>[] = [];
  for (let r = dataStartRow; r <= ws.rowCount; r++) {
    const rowValues = ws.getRow(r).values as unknown[];
    if (!rowValues || rowValues.every(v => v == null || v === '')) continue;
    const obj: Record<string, string> = {};
    for (const [idx, key] of colMap.entries()) {
      const v = rowValues[idx];
      obj[key] = v == null ? '' : String(v);
    }
    if (Object.values(obj).some(v => v.trim())) rows.push(obj);
  }

  return { rows, matchedColumns: [...colMap.values()], unmatchedHeaders };
}
