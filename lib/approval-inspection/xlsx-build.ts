import ExcelJS from 'exceljs';
import type { InspectionDocMeta, DocProduct } from './docx-build';

/**
 * 참고 엑셀의 근본 문제(측정항목마다 컬럼을 만들어 인쇄 폭을 넘김)를 XLSX에서도
 * 반복하지 않도록 시트를 "제품별 세로 카드" 구조로 만든다 — 측정값도 항목을
 * 행으로 나열(6컬럼 고정)한다. pageSetup에 fitToWidth:1/fitToHeight:0을 명시해
 * 참고 엑셀이 놓쳤던 "가로 1페이지에 맞추기"를 처음부터 강제한다.
 */

const B: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } };
const bAll = { top: B, left: B, bottom: B, right: B } as ExcelJS.Borders;
const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } } as ExcelJS.Fill;

function styledHeaderRow(ws: ExcelJS.Worksheet, values: string[]) {
  const row = ws.addRow(values);
  row.font = { bold: true };
  row.eachCell(c => { c.border = bAll; c.fill = headerFill; c.alignment = { vertical: 'middle', wrapText: true }; });
  return row;
}
function styledBodyRow(ws: ExcelJS.Worksheet, values: (string | number)[]) {
  const row = ws.addRow(values);
  row.eachCell(c => { c.border = bAll; c.alignment = { vertical: 'middle', wrapText: true }; });
  return row;
}
function fmtValueUnit(value?: string, unit?: string): string {
  const v = (value ?? '').trim();
  if (!v) return '-';
  const u = (unit ?? '').trim();
  return u ? `${v}${u}` : v;
}

const WIRE_ROLE_LABEL: Record<string, string> = { input: '입력선', output: '출력선' };

export interface BuildInspectionXlsxOptions {
  meta: InspectionDocMeta;
  products: DocProduct[];
}

export async function buildInspectionXlsx(opts: BuildInspectionXlsxOptions): Promise<ExcelJS.Buffer> {
  const { meta, products } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'YNK 그룹웨어 — 제품 승인검사';

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const sheetName = `제품${i + 1}_${(p.modelName || p.productName || '').slice(0, 15)}`.replace(/[[\]*?/\\:]/g, '').slice(0, 31) || `제품${i + 1}`;
    const ws = wb.addWorksheet(sheetName, {
      pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: 'portrait', paperSize: 9 },
    });
    ws.columns = [{ width: 20 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 16 }];

    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `${meta.title} — ${meta.businessId}`;
    ws.getCell('A1').font = { bold: true, size: 14 };

    ws.addRow([]);
    styledBodyRow(ws, ['제품명', p.productName || '-', '모델명', p.modelName || '-']);
    styledBodyRow(ws, ['제조업체', p.manufacturer || '-', '생산 LOT', p.productionLot || '-']);
    styledBodyRow(ws, ['인증번호', p.certNumber || '-', '치수/중량', `${p.dimensions || '-'} / ${p.weightG ? `${p.weightG}g` : '-'}`]);
    ws.addRow([]);

    styledHeaderRow(ws, ['항목', '기준값', '측정값', '허용범위', '판정']);
    for (const m of p.measurements) {
      styledBodyRow(ws, [
        m.itemLabel, fmtValueUnit(m.baselineValue, m.baselineUnit), fmtValueUnit(m.measuredValue, m.measuredUnit),
        m.minValue || m.maxValue ? `${m.minValue ?? ''}~${m.maxValue ?? ''}` : '-', m.judgement || '-',
      ]);
    }
    ws.addRow([]);

    if (p.wireSpecs.length > 0) {
      styledHeaderRow(ws, ['구분', '규격', '단면적', '기준길이', '측정길이', '커넥터']);
      for (const w of p.wireSpecs) {
        styledBodyRow(ws, [
          WIRE_ROLE_LABEL[w.wireRole] || w.wireRole, w.wireSpec || '-', w.conductorArea || '-',
          fmtValueUnit(w.baselineLengthValue, w.baselineLengthUnit), fmtValueUnit(w.measuredLengthValue, w.measuredLengthUnit), w.connectorModel || '-',
        ]);
      }
      ws.addRow([]);
    }

    if (p.diffs.length > 0) {
      styledHeaderRow(ws, ['비교항목', '판정', '변경위치', '사유', '승인필요']);
      for (const d of p.diffs) {
        styledBodyRow(ws, [d.compareItem, d.judgement || '-', d.changeLocation || '-', d.reason || '-', d.needsApproval ? 'Y' : '-']);
      }
      ws.addRow([]);
    }

    if (p.photos.length > 0) {
      const photoHeaderRow = ws.addRow(['사진']);
      photoHeaderRow.font = { bold: true };
      let currentRow = ws.rowCount + 1;
      for (const photo of p.photos) {
        const imageId = wb.addImage({ buffer: photo.buffer as unknown as ExcelJS.Buffer, extension: 'png' });
        const maxWidthPx = 240;
        const ratio = Math.min(1, maxWidthPx / photo.width);
        const wPx = Math.round(photo.width * ratio);
        const hPx = Math.round(photo.height * ratio);
        ws.addImage(imageId, { tl: { col: 0, row: currentRow - 1 }, ext: { width: wPx, height: hPx } });
        ws.getCell(currentRow, 3).value = photo.label;
        const rowsNeeded = Math.max(1, Math.ceil(hPx / 15));
        currentRow += rowsNeeded + 1;
      }
      for (let r = ws.rowCount + 1; r < currentRow; r++) ws.addRow([]);
    }
  }

  if (wb.worksheets.length === 0) wb.addWorksheet('빈 문서');
  return wb.xlsx.writeBuffer();
}
