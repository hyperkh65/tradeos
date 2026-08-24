import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { calcTradeStatementTotals, type TradeStatementItem } from '@/lib/trade-statement';
import ExcelJS from 'exceljs';

type BorderStyle = 'thin' | 'medium';
const B = (s: BorderStyle = 'thin'): ExcelJS.Border => ({ style: s, color: { argb: 'FF888888' } });
const bAll = { top: B(), left: B(), bottom: B(), right: B() };

function setCell(
  ws: ExcelJS.Worksheet, addr: string, value: ExcelJS.CellValue,
  opts: { bold?: boolean; align?: ExcelJS.Alignment['horizontal']; fill?: string; size?: number; numFmt?: string } = {}
) {
  const cell = ws.getCell(addr);
  cell.value = value;
  cell.border = bAll;
  cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', wrapText: true };
  cell.font = { bold: !!opts.bold, size: opts.size ?? 10 };
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + opts.fill } };
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  return cell;
}

interface Party { bizNo: string; name: string; ceo: string; address: string; bizType: string; bizItem: string }

function writePartyBox(ws: ExcelJS.Worksheet, startRow: number, label: string, party: Party, colOffset: number) {
  const c = (n: number) => String.fromCharCode('A'.charCodeAt(0) + colOffset + n);
  ws.mergeCells(`${c(0)}${startRow}:${c(0)}${startRow + 5}`);
  setCell(ws, `${c(0)}${startRow}`, label, { bold: true, align: 'center', fill: 'F5F5F5' });
  const fields: [string, string][] = [
    ['등록번호', party.bizNo], ['상    호', party.name], ['대 표 자', party.ceo],
    ['주    소', party.address], ['업    태', party.bizType], ['종    목', party.bizItem],
  ];
  fields.forEach(([label2, val], i) => {
    const r = startRow + i;
    setCell(ws, `${c(1)}${r}`, label2, { bold: true, fill: 'FAFAFA', align: 'center' });
    ws.mergeCells(`${c(2)}${r}:${c(3)}${r}`);
    setCell(ws, `${c(2)}${r}`, val);
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`SELECT * FROM documents WHERE doc_type='trade_statement_custom' AND related_type='sale' AND related_id=? ORDER BY updated_at DESC LIMIT 1`).get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 });

  const data = JSON.parse((row.data_json as string) || '{}') as {
    docNo: string; issueDate: string; supplier: Party; customer: Party; items: TradeStatementItem[];
  };
  const items = data.items || [];
  const { supplyAmount, vatAmount, totalAmount } = calcTradeStatementTotals(items);
  const saleRow = db.prepare('SELECT business_id, total_amount FROM sales WHERE id=?').get(id) as { business_id: string; total_amount: number } | undefined;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'YNK ERP';
  const ws = wb.addWorksheet('거래명세표');
  ws.columns = [{ width: 5 }, { width: 12 }, { width: 24 }, { width: 12 }, { width: 8 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 12 }];

  ws.mergeCells('A1:I1');
  setCell(ws, 'A1', '거 래 명 세 표', { bold: true, align: 'center', size: 18 });
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:D2'); setCell(ws, 'A2', `번호 : ${data.docNo}`);
  ws.mergeCells('F2:I2'); setCell(ws, 'F2', `일자 : ${data.issueDate}`, { align: 'right' });

  writePartyBox(ws, 3, '공급자', data.supplier, 0);
  writePartyBox(ws, 3, '공급받는자', data.customer, 4);

  const headerRow = 9;
  ['No', '품명 / 규격', '', '', '단위', '수량', '단가', '금액', '비고'].forEach((v, i) => {
    setCell(ws, `${String.fromCharCode(65 + i)}${headerRow}`, v, { bold: true, align: 'center', fill: 'DDDDDD' });
  });
  ws.mergeCells(`B${headerRow}:D${headerRow}`);

  let r = headerRow + 1;
  const itemStart = r;
  for (const it of items) {
    setCell(ws, `A${r}`, r - itemStart + 1, { align: 'center' });
    ws.mergeCells(`B${r}:D${r}`);
    setCell(ws, `B${r}`, it.specification ? `${it.productName}  (${it.specification})` : it.productName);
    setCell(ws, `E${r}`, it.unit, { align: 'center' });
    setCell(ws, `F${r}`, it.qty, { align: 'right', numFmt: '#,##0' });
    setCell(ws, `G${r}`, it.unitPrice, { align: 'right', numFmt: '#,##0' });
    setCell(ws, `H${r}`, it.qty * it.unitPrice, { align: 'right', numFmt: '#,##0' });
    setCell(ws, `I${r}`, it.remark, { size: 9 });
    r++;
  }
  const blankUntil = Math.max(r, itemStart + 13);
  for (; r < blankUntil; r++) {
    ws.mergeCells(`B${r}:D${r}`);
    for (const col of ['A', 'B', 'E', 'F', 'G', 'H', 'I']) setCell(ws, `${col}${r}`, '');
  }

  const totalsRow = r + 1;
  setCell(ws, `A${totalsRow}`, '공급가액', { bold: true, align: 'center', fill: 'F5F5F5' });
  ws.mergeCells(`B${totalsRow}:C${totalsRow}`);
  setCell(ws, `B${totalsRow}`, supplyAmount, { bold: true, align: 'right', numFmt: '#,##0' });
  setCell(ws, `D${totalsRow}`, '부가세', { bold: true, align: 'center', fill: 'F5F5F5' });
  setCell(ws, `E${totalsRow}`, vatAmount, { bold: true, align: 'right', numFmt: '#,##0' });
  ws.mergeCells(`F${totalsRow}:G${totalsRow}`);
  setCell(ws, `F${totalsRow}`, '합    계', { bold: true, align: 'center', fill: 'F5F5F5' });
  ws.mergeCells(`H${totalsRow}:I${totalsRow}`);
  setCell(ws, `H${totalsRow}`, totalAmount, { bold: true, align: 'right', numFmt: '#,##0' });

  const signRow = totalsRow + 2;
  ws.mergeCells(`A${signRow}:D${signRow}`);
  ws.getCell(`A${signRow}`).value = data.supplier.name;
  ws.getCell(`A${signRow}`).font = { bold: true, size: 12 };
  ws.mergeCells(`F${signRow}:I${signRow}`);
  ws.getCell(`F${signRow}`).value = '인수자 :                     (인)';
  ws.getCell(`F${signRow}`).alignment = { horizontal: 'right' };

  const buf = await wb.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${saleRow?.business_id || id}_거래명세표(고객양식).xlsx`);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
