import ExcelJS from 'exceljs';

/**
 * §17 요구사항 — 공급업체가 이미 쓰고 있는 참고 엑셀(Driver Pre-approval Report.xlsx)
 * 형식 그대로 가져오기/빈양식을 지원한다. 실제 파일을 exceljs로 직접 열어 확인한 구조:
 *   5행 = 헤더(No/Item/Model/Watt/IN mA/PF/OUT V/OUT A/OUT Vmax/Insulation resistance)
 *   6행부터 제품마다 6행씩: 측정값 1행 + "Image" 라벨 3행 + 배선 1행 + 여백 1행
 * 내부 저장/출력(docx/xlsx-build.ts)은 이 컬럼형 레이아웃을 절대 쓰지 않지만(페이지 분리
 * 버그의 원인이므로), 공급업체와 주고받는 "가져오기 입력 형식"으로는 익숙한 이 레이아웃을
 * 그대로 유지한다 — 데이터 교환 형식과 내부 렌더링 형식을 분리한 설계.
 */

export const REFERENCE_COLUMN_MAP: { header: string; itemKey: string; itemLabel: string; unit: string }[] = [
  { header: 'Watt', itemKey: 'rated_power', itemLabel: '정격전력', unit: 'W' },
  { header: 'IN mA', itemKey: 'input_current', itemLabel: '입력전류', unit: 'mA' },
  { header: 'PF', itemKey: 'power_factor', itemLabel: '역률', unit: '' },
  { header: 'OUT V', itemKey: 'output_voltage', itemLabel: '출력전압', unit: 'V' },
  { header: 'OUT A', itemKey: 'output_current', itemLabel: '출력전류', unit: 'A' },
  { header: 'OUT Vmax', itemKey: 'output_voltage_max', itemLabel: '최대 출력전압', unit: 'V' },
  { header: 'Insulation resistance', itemKey: 'insulation_resistance', itemLabel: '절연저항', unit: 'MΩ' },
];

export interface ImportedProductRow {
  productName: string;
  modelName: string;
  measurements: { itemKey: string; itemLabel: string; value: string; unit: string }[];
}
export interface XlsxImportResult { products: ImportedProductRow[]; warnings: string[] }

/**
 * 헤더 행과 각 컬럼 위치를 전부 텍스트 매칭으로 동적으로 찾는다 — 고정 컬럼 번호에
 * 의존하면 실제 참고 엑셀(선행 빈 A열이 있어 No가 B열부터 시작)과 이 파일이 만드는
 * 빈 양식(A열부터 시작)의 오프셋이 어긋나 잘못 매핑되는 실제 버그가 있었다(라운드트립
 * 테스트로 발견). "Model"/"Item"/"Watt" 같은 헤더 텍스트가 실제로 어느 열에 있는지
 * 매 파일마다 다시 찾으므로 오프셋이 몇 칸이든 항상 정확히 맞는다.
 */
export async function parseReferenceInspectionXlsx(buffer: Buffer): Promise<XlsxImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { products: [], warnings: ['시트를 찾을 수 없습니다.'] };

  let headerRow = -1;
  let colMap = new Map<string, number>();
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    const row = ws.getRow(r);
    const found = new Map<string, number>();
    for (let c = 1; c <= (row.cellCount || 20); c++) {
      const v = row.getCell(c).value;
      const text = v != null ? String(v).trim().toLowerCase() : '';
      if (text) found.set(text, c);
    }
    if (found.has('model') && found.has('pf')) { headerRow = r; colMap = found; break; }
  }
  if (headerRow === -1) return { products: [], warnings: ['헤더 행(Model/PF 포함)을 찾을 수 없습니다. 참고 엑셀 형식과 다른 파일일 수 있습니다.'] };

  const itemCol = colMap.get('item');
  const modelCol = colMap.get('model');
  if (!modelCol) return { products: [], warnings: ['Model 열을 찾을 수 없습니다.'] };

  const measurementCols = REFERENCE_COLUMN_MAP.map(m => ({ ...m, col: colMap.get(m.header.toLowerCase()) }))
    .filter((m): m is typeof m & { col: number } => m.col != null);
  const watCol = measurementCols.find(m => m.itemKey === 'rated_power')?.col;

  const products: ImportedProductRow[] = [];
  const warnings: string[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const modelVal = row.getCell(modelCol).value;
    const modelStr = modelVal != null ? String(modelVal).trim() : '';
    if (!modelStr || modelStr.toLowerCase() === 'image') continue;
    if (watCol != null) {
      const wattNum = Number(row.getCell(watCol).value);
      if (!Number.isFinite(wattNum)) continue;
    }

    const itemVal = itemCol ? row.getCell(itemCol).value : null;
    const productName = itemVal != null ? String(itemVal).trim() : modelStr;

    const measurements = measurementCols.map(m => {
      const raw = row.getCell(m.col).value;
      const value = raw != null ? String(raw).trim() : '';
      return { itemKey: m.itemKey, itemLabel: m.itemLabel, value, unit: m.unit };
    }).filter(m => m.value !== '');

    products.push({ productName, modelName: modelStr, measurements });
  }

  if (products.length === 0) warnings.push('가져올 제품 데이터 행을 찾지 못했습니다.');
  return { products, warnings };
}

/** 빈 양식 — 공급업체가 이미 아는 참고 엑셀 컬럼 레이아웃 그대로, 값만 비운 한 줄을 만든다.
 * 병합 셀/이미지 자리 등 장식은 재현하지 않는다(가져오기 파서는 컬럼 위치만 보므로
 * 굳이 원본과 픽셀 단위로 같을 필요가 없음 — 데이터 교환 목적에는 헤더+빈 행이면 충분). */
export async function buildBlankReferenceTemplateXlsx(): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  const headers = ['No', 'Item', 'Model', ...REFERENCE_COLUMN_MAP.map(m => m.header)];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } }; });
  ws.addRow([1, '(제품명 입력)', '(모델명 입력)']);
  ws.columns.forEach(col => { col.width = 16; });
  return wb.xlsx.writeBuffer();
}
