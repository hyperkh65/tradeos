import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { generateCompanyLedgerPdf } from '@/lib/pdf/generate';
import ExcelJS from 'exceljs';

const B: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } };
const bAll = { top: B, left: B, bottom: B, right: B } as ExcelJS.Borders;

interface LedgerEntry {
  date: string; saleBusinessId: string; productName: string; specification: string;
  qty: number; unitPrice: number; amount: number;
}

function loadEntries(companyName: string, start: string, end: string): LedgerEntry[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM sales WHERE customer=? AND sale_date>=? AND sale_date<=? ORDER BY sale_date ASC, created_at ASC`)
    .all(companyName, start, end) as Record<string, unknown>[];
  const entries: LedgerEntry[] = [];
  for (const row of rows) {
    let items: Array<{ product?: string; specification?: string; qty?: number; unitPrice?: number; amount?: number }> = [];
    try { items = JSON.parse((row.items_json as string) || '[]'); } catch { /* ignore */ }
    for (const it of items) {
      entries.push({
        date: row.sale_date as string, saleBusinessId: row.business_id as string,
        productName: it.product || '', specification: it.specification || '',
        qty: it.qty || 0, unitPrice: it.unitPrice || 0, amount: it.amount || (it.qty || 0) * (it.unitPrice || 0),
      });
    }
  }
  return entries;
}

async function buildExcel(companyName: string, start: string, end: string, entries: LedgerEntry[]): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'YNK ERP';
  const ws = wb.addWorksheet('거래처원장');
  ws.columns = [
    { width: 12 }, { width: 16 }, { width: 30 }, { width: 22 }, { width: 10 }, { width: 14 }, { width: 14 },
  ];

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = `거래처원장 - ${companyName} (${start} ~ ${end})`;
  ws.getCell('A1').font = { bold: true, size: 14 };

  const headerRow = ws.getRow(3);
  ['날짜', '거래번호', '품목', '규격', '수량', '단가', '금액'].forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h; c.font = { bold: true }; c.border = bAll;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } };
  });

  let r = 4;
  let curMonth = '', monthQty = 0, monthAmount = 0, cumulative = 0;
  const flushMonth = () => {
    if (!curMonth) return;
    const row = ws.getRow(r++);
    row.getCell(1).value = `${curMonth} 월별소계`;
    ws.mergeCells(`A${row.number}:D${row.number}`);
    row.getCell(5).value = monthQty;
    row.getCell(7).value = monthAmount;
    row.eachCell(c => { c.border = bAll; c.font = { bold: true }; });
    row.getCell(7).numFmt = '#,##0';
    monthQty = 0; monthAmount = 0;
  };

  for (const e of entries) {
    const m = e.date.slice(0, 7);
    if (m !== curMonth) { flushMonth(); curMonth = m; }
    cumulative += e.amount; monthQty += e.qty; monthAmount += e.amount;
    const row = ws.getRow(r++);
    row.getCell(1).value = e.date;
    row.getCell(2).value = e.saleBusinessId;
    row.getCell(3).value = e.productName;
    row.getCell(4).value = e.specification;
    row.getCell(5).value = e.qty;
    row.getCell(6).value = e.unitPrice;
    row.getCell(7).value = e.amount;
    row.eachCell(c => { c.border = bAll; });
    row.getCell(6).numFmt = '#,##0.00';
    row.getCell(7).numFmt = '#,##0';
  }
  flushMonth();

  const totalRow = ws.getRow(r++);
  totalRow.getCell(1).value = '총 누적소계';
  ws.mergeCells(`A${totalRow.number}:D${totalRow.number}`);
  totalRow.getCell(5).value = entries.reduce((s, e) => s + e.qty, 0);
  totalRow.getCell(7).value = entries.reduce((s, e) => s + e.amount, 0);
  totalRow.eachCell(c => { c.border = bAll; c.font = { bold: true }; });
  totalRow.getCell(7).numFmt = '#,##0';

  return wb.xlsx.writeBuffer();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const company = db.prepare('SELECT name FROM companies WHERE id=?').get(id) as { name: string } | undefined;
  if (!company) return NextResponse.json({ error: '거래처를 찾을 수 없습니다.' }, { status: 404 });

  const url = new URL(req.url);
  const start = url.searchParams.get('start') || '1970-01-01';
  const end = url.searchParams.get('end') || '9999-12-31';
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'excel';

  if (format === 'pdf') {
    const buf = await generateCompanyLedgerPdf(id, start, end);
    if (!buf) return NextResponse.json({ error: '거래처를 찾을 수 없습니다.' }, { status: 404 });
    const filename = encodeURIComponent(`${company.name}_거래처원장.pdf`);
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename*=UTF-8''${filename}` },
    });
  }

  const entries = loadEntries(company.name, start, end);
  const buf = await buildExcel(company.name, start, end, entries);
  const filename = encodeURIComponent(`${company.name}_거래처원장.xlsx`);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
