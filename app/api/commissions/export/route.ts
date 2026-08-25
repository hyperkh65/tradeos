import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { generateCommissionsListPdf } from '@/lib/pdf/generate';
import ExcelJS from 'exceljs';

interface CommissionRow {
  business_id: string; foreign_company: string; date: string; currency: string;
  amount: number; exchange_rate: number; amount_krw: number; deposit_date: string | null; status: string;
}

function loadRows(): CommissionRow[] {
  const db = getDb();
  return db.prepare(`SELECT business_id, foreign_company, date, currency, amount, exchange_rate, amount_krw, deposit_date, status FROM commissions ORDER BY date DESC, created_at DESC`).all() as CommissionRow[];
}

const B: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } };
const bAll = { top: B, left: B, bottom: B, right: B } as ExcelJS.Borders;

async function buildExcel(): Promise<ExcelJS.Buffer> {
  const rows = loadRows();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'YNK ERP';
  const ws = wb.addWorksheet('커미션');
  ws.columns = [
    { header: '번호', key: 'businessId', width: 16 },
    { header: '해외업체명', key: 'foreignCompany', width: 24 },
    { header: '일자', key: 'date', width: 12 },
    { header: '통화', key: 'currency', width: 8 },
    { header: '금액', key: 'amount', width: 14 },
    { header: '환율', key: 'exchangeRate', width: 10 },
    { header: '원화환산액', key: 'amountKrw', width: 14 },
    { header: '입금일', key: 'depositDate', width: 12 },
    { header: '상태', key: 'status', width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).eachCell(c => { c.border = bAll; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } }; });

  for (const r of rows) {
    const row = ws.addRow({
      businessId: r.business_id, foreignCompany: r.foreign_company, date: r.date, currency: r.currency,
      amount: r.amount, exchangeRate: r.exchange_rate || '', amountKrw: r.amount_krw || '',
      depositDate: r.deposit_date || '', status: r.status === 'closed' ? '마감' : '진행중',
    });
    row.eachCell(c => { c.border = bAll; });
    row.getCell('amount').numFmt = '#,##0.00';
    row.getCell('amountKrw').numFmt = '#,##0';
  }

  const totalRow = ws.addRow({ businessId: '합계', amountKrw: rows.reduce((s, r) => s + (r.amount_krw || 0), 0) });
  totalRow.font = { bold: true };
  totalRow.getCell('amountKrw').numFmt = '#,##0';
  totalRow.eachCell(c => { c.border = bAll; });

  return wb.xlsx.writeBuffer();
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const format = new URL(req.url).searchParams.get('format') === 'pdf' ? 'pdf' : 'excel';

  if (format === 'pdf') {
    const buf = await generateCommissionsListPdf();
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="commissions.pdf"` },
    });
  }
  const buf = await buildExcel();
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="commissions.xlsx"`,
    },
  });
}
