import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { calcSettlementTotals, type SettlementItem } from '@/lib/settlement-statement';
import ExcelJS from 'exceljs';

const NUM_FMT_INT = '_-* #,##0_-;-* #,##0_-;_-* "-"_-;_-@_-';
const NUM_FMT_DEC = '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"_-;_-@_-';
const BORDER: ExcelJS.Border = { style: 'thin', color: { argb: 'FFB2B2B2' } };
const bAll = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`SELECT * FROM documents WHERE doc_type='rmb_settlement_statement' AND related_type='sale' AND related_id=? ORDER BY updated_at DESC LIMIT 1`).get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 });

  const data = JSON.parse((row.data_json as string) || '{}') as { title: string; issueDate: string; exchangeRate: number; items: SettlementItem[]; note: string };
  const { computed, totals } = calcSettlementTotals(data.items || [], data.exchangeRate || 0);
  const saleRow = db.prepare('SELECT business_id FROM sales WHERE id=?').get(id) as { business_id: string } | undefined;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'YNK ERP';
  // 시트명은 * ? : \ / [ ] 를 쓸 수 없다 — 제목에 "8/27" 같은 날짜 표기가 흔히 들어가므로 치환.
  const sheetName = (data.title || '정산내역').replace(/[*?:\\/[\]]/g, '-').slice(0, 30) || '정산내역';
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [
    { width: 8 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 14 },
    { width: 10 }, { width: 15 }, { width: 15 }, { width: 17 }, { width: 12 },
  ];

  const headers = ['품목', '수량\n(Set)', '단가\n(RMB)', '잔금\n(100%, RMB)', '적용환율', '환산금액\n(KRW)', '환산금액\n(KRW, 부가세)', '환산금액\n(부가세포함, KRW)', '비고'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(2, i + 2);
    cell.value = h;
    cell.font = { size: 11, name: '나눔고딕' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = bAll;
  });
  ws.getRow(2).height = 34.95;

  const totalRowIdx = 3;
  const totalVals = ['합계', totals.qty, 'N/A', totals.balanceRmb, data.exchangeRate || 0, totals.convertedKrw, totals.vatKrw, totals.totalKrw, ''];
  totalVals.forEach((v, i) => {
    const cell = ws.getCell(totalRowIdx, i + 2);
    cell.value = v as ExcelJS.CellValue;
    cell.font = { bold: true, size: 11, color: { argb: 'FF006100' }, name: '나눔고딕' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
    cell.alignment = { horizontal: i === 0 ? 'center' : 'right', vertical: 'middle' };
    cell.border = bAll;
    if (i === 2) cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if ([1].includes(i)) cell.numFmt = NUM_FMT_INT;
    if ([3, 4].includes(i)) cell.numFmt = NUM_FMT_DEC;
    if ([5, 6, 7].includes(i)) cell.numFmt = NUM_FMT_INT;
  });

  let r = totalRowIdx + 1;
  for (const it of computed) {
    const vals = [it.productName, it.qty, it.unitPriceRmb, it.balanceRmb, data.exchangeRate || 0, it.convertedKrw, it.vatKrw, it.totalKrw, it.remark];
    vals.forEach((v, i) => {
      const cell = ws.getCell(r, i + 2);
      cell.value = v as ExcelJS.CellValue;
      cell.font = { size: 11, name: '나눔고딕' };
      cell.alignment = i === 0 ? { horizontal: 'left', vertical: 'middle', indent: 1 } : { horizontal: 'right', vertical: 'middle' };
      cell.border = bAll;
      if (i === 1) cell.numFmt = NUM_FMT_INT;
      if ([2, 3, 4].includes(i)) cell.numFmt = NUM_FMT_DEC;
      if ([5, 6, 7].includes(i)) cell.numFmt = NUM_FMT_INT;
    });
    ws.getRow(r).height = 22.05;
    r++;
  }

  if (data.note) {
    ws.getCell(r + 1, 2).value = data.note;
    ws.getCell(r + 1, 2).font = { size: 10, italic: true, color: { argb: 'FF666666' }, name: '나눔고딕' };
  }

  ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 1, orientation: 'landscape', paperSize: 9 };

  const buf = await wb.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${saleRow?.business_id || id}_${data.title || '정산내역'}.xlsx`);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
