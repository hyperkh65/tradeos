import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { getCompanySettings } from '@/lib/pdf/company';
import ExcelJS from 'exceljs';

const B: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } };
const bAll = { top: B, left: B, bottom: B, right: B } as ExcelJS.Borders;

interface RfqItem { name: string; specification?: string; qty: number; unit?: string; remark?: string }

async function buildRfqExcel(row: Record<string, unknown>): Promise<ExcelJS.Buffer> {
  const data = JSON.parse((row.data_json as string) || '{}') as {
    date?: string; validUntil?: string;
    supplierName: string; supplierContact?: string; supplierEmail?: string; supplierPhone?: string; supplierAddress?: string;
    items: RfqItem[]; remark?: string;
  };
  const company = getCompanySettings();
  const wb = new ExcelJS.Workbook();
  wb.creator = company.name || 'YNK';
  const ws = wb.addWorksheet('견적의뢰서');

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = '견적 의뢰서 (REQUEST FOR QUOTATION)';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.getRow(1).height = 24;

  ws.getCell('A3').value = '문서번호'; ws.getCell('B3').value = row.business_id as string;
  ws.getCell('A4').value = '작성일'; ws.getCell('B4').value = data.date || (row.created_at as string)?.slice(0, 10) || '';
  ws.getCell('A5').value = '유효기한'; ws.getCell('B5').value = data.validUntil || '';
  ['A3', 'A4', 'A5'].forEach(c => { ws.getCell(c).font = { bold: true }; });

  ws.getCell('D3').value = 'FROM (구매자)'; ws.getCell('D3').font = { bold: true };
  ws.getCell('E3').value = company.name || '';
  ws.getCell('D4').value = 'TO (공급사)'; ws.getCell('D4').font = { bold: true };
  ws.getCell('E4').value = data.supplierName || '';
  ws.getCell('D5').value = '공급사 연락처'; ws.getCell('D5').font = { bold: true };
  ws.getCell('E5').value = [data.supplierContact, data.supplierPhone, data.supplierEmail].filter(Boolean).join(' / ');

  const headerRowIdx = 7;
  ws.getRow(headerRowIdx).values = ['NO', '품목', '규격', '단위', '수량', '비고'];
  ws.getRow(headerRowIdx).font = { bold: true };
  ws.getRow(headerRowIdx).eachCell(c => { c.border = bAll; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } }; });
  ws.columns = [
    { key: 'no', width: 6 }, { key: 'name', width: 28 }, { key: 'spec', width: 22 },
    { key: 'unit', width: 8 }, { key: 'qty', width: 10 }, { key: 'remark', width: 24 },
  ];

  (data.items || []).forEach((it, i) => {
    const r = ws.addRow([i + 1, it.name, it.specification || '', it.unit || 'EA', it.qty || 0, it.remark || '']);
    r.eachCell(c => { c.border = bAll; });
  });

  if (data.remark) {
    const remarkRow = ws.rowCount + 2;
    ws.getCell(`A${remarkRow}`).value = '요청사항';
    ws.getCell(`A${remarkRow}`).font = { bold: true };
    ws.mergeCells(`B${remarkRow}:F${remarkRow}`);
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
