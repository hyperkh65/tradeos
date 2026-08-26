import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { getCompanySettings } from '@/lib/pdf/company';
import { resolveItemImagePath } from '@/lib/pdf/resolve-image';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

const B: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } };
const bAll = { top: B, left: B, bottom: B, right: B } as ExcelJS.Borders;

interface RfqItem {
  name: string; specification?: string; qty: number; unit?: string; remark?: string;
  unitPrice?: number; images?: { url: string }[];
}

function fmtPrice(n: number | undefined, currency: string) {
  if (!n) return '';
  return n.toLocaleString(currency === 'KRW' ? 'ko-KR' : 'en-US', { minimumFractionDigits: currency === 'KRW' ? 0 : 2, maximumFractionDigits: currency === 'KRW' ? 0 : 2 });
}

async function buildRfqExcel(row: Record<string, unknown>): Promise<ExcelJS.Buffer> {
  const data = JSON.parse((row.data_json as string) || '{}') as {
    date?: string; validUntil?: string; currency?: string; paymentTerms?: string;
    supplierName: string; supplierContact?: string; supplierEmail?: string; supplierPhone?: string; supplierAddress?: string;
    items: RfqItem[]; remark?: string;
  };
  const currency = data.currency || 'USD';
  const company = getCompanySettings();
  const wb = new ExcelJS.Workbook();
  wb.creator = company.name || 'YNK';
  const ws = wb.addWorksheet('견적의뢰서');

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = '견적 의뢰서 (REQUEST FOR QUOTATION)';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.getRow(1).height = 24;

  ws.getCell('A3').value = '문서번호'; ws.getCell('B3').value = row.business_id as string;
  ws.getCell('A4').value = '작성일'; ws.getCell('B4').value = data.date || (row.created_at as string)?.slice(0, 10) || '';
  ws.getCell('A5').value = '유효기한'; ws.getCell('B5').value = data.validUntil || '';
  ws.getCell('A6').value = '통화'; ws.getCell('B6').value = currency;
  ['A3', 'A4', 'A5', 'A6'].forEach(c => { ws.getCell(c).font = { bold: true }; });

  ws.getCell('D3').value = 'FROM (구매자)'; ws.getCell('D3').font = { bold: true };
  ws.getCell('E3').value = company.name || '';
  ws.getCell('D4').value = 'TO (공급사)'; ws.getCell('D4').font = { bold: true };
  ws.getCell('E4').value = data.supplierName || '';
  ws.getCell('D5').value = '공급사 연락처'; ws.getCell('D5').font = { bold: true };
  ws.getCell('E5').value = [data.supplierContact, data.supplierPhone, data.supplierEmail].filter(Boolean).join(' / ');
  ws.getCell('D6').value = '지급조건'; ws.getCell('D6').font = { bold: true };
  ws.getCell('E6').value = data.paymentTerms || '';

  const headerRowIdx = 8;
  ws.getRow(headerRowIdx).values = ['NO', '사진', '품목', '규격', '단위', '수량', `단가(${currency})`, `금액(${currency})`, '비고'];
  ws.getRow(headerRowIdx).font = { bold: true };
  ws.getRow(headerRowIdx).eachCell(c => { c.border = bAll; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } }; });
  ws.columns = [
    { key: 'no', width: 6 }, { key: 'photo', width: 10 }, { key: 'name', width: 24 }, { key: 'spec', width: 18 },
    { key: 'unit', width: 8 }, { key: 'qty', width: 9 }, { key: 'unitPrice', width: 13 }, { key: 'amount', width: 13 }, { key: 'remark', width: 20 },
  ];

  const items = data.items || [];
  let totalAmount = 0;
  items.forEach((it, i) => {
    const rowIdx = headerRowIdx + 1 + i;
    const amount = (it.qty || 0) * (it.unitPrice || 0);
    totalAmount += amount;
    const r = ws.getRow(rowIdx);
    r.getCell(1).value = i + 1;
    r.getCell(3).value = it.name;
    r.getCell(4).value = it.specification || '';
    r.getCell(5).value = it.unit || 'EA';
    r.getCell(6).value = it.qty || 0;
    r.getCell(7).value = fmtPrice(it.unitPrice, currency);
    r.getCell(8).value = amount ? fmtPrice(amount, currency) : '';
    r.getCell(9).value = it.remark || '';
    r.height = 46;
    r.eachCell(c => { c.border = bAll; c.alignment = { vertical: 'middle' }; });

    const localPath = resolveItemImagePath(it.images?.[0]?.url);
    if (localPath && fs.existsSync(localPath) && !/^https?:\/\//i.test(localPath)) {
      try {
        const ext = path.extname(localPath).toLowerCase().replace('.', '');
        const extension = (ext === 'jpg' ? 'jpeg' : ext) as 'jpeg' | 'png' | 'gif';
        if (['jpeg', 'png', 'gif'].includes(extension)) {
          const imageId = wb.addImage({ buffer: fs.readFileSync(localPath) as unknown as ExcelJS.Buffer, extension });
          ws.addImage(imageId, { tl: { col: 1.05, row: rowIdx - 1 + 0.05 }, ext: { width: 50, height: 50 } });
        }
      } catch { /* 이미지 임베드 실패 시 무시하고 계속 진행 */ }
    }
  });

  const totalRowIdx = headerRowIdx + 1 + items.length;
  if (totalAmount > 0) {
    ws.mergeCells(`A${totalRowIdx}:F${totalRowIdx}`);
    ws.getCell(`A${totalRowIdx}`).value = `합계 (${currency})`;
    ws.getCell(`A${totalRowIdx}`).font = { bold: true };
    ws.getCell(`A${totalRowIdx}`).alignment = { horizontal: 'right' };
    ws.getCell(`H${totalRowIdx}`).value = fmtPrice(totalAmount, currency);
    ws.getCell(`H${totalRowIdx}`).font = { bold: true };
    ws.getRow(totalRowIdx).eachCell(c => { c.border = bAll; });
  }

  if (data.remark) {
    const remarkRow = ws.rowCount + 2;
    ws.getCell(`A${remarkRow}`).value = '요청사항';
    ws.getCell(`A${remarkRow}`).font = { bold: true };
    ws.mergeCells(`B${remarkRow}:I${remarkRow}`);
    ws.getCell(`B${remarkRow}`).value = data.remark;
  }

  return wb.xlsx.writeBuffer();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const row = getDb().prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });

  if (row.doc_type !== 'rfq') return NextResponse.json({ error: '지원하지 않는 문서 종류입니다' }, { status: 400 });

  const buf = await buildRfqExcel(row);
  const filename = `${row.business_id}_${row.title}.xlsx`;
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
