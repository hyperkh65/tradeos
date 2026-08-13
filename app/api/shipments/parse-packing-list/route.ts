import { NextRequest, NextResponse } from 'next/server';
import { newId } from '@/lib/db/sqlite';
import type { CargoItem } from '@/types';

export const maxDuration = 60;

// Column keyword matchers
const COL_KEYWORDS = {
  product: /제품명?|품명|description|product|item|name|goods/i,
  qty: /수량|qty|quantity|pcs|개수/i,
  grossWeight: /총?중량|gross.?weight|g\.?w\.?|총?무게/i,
  netWeight: /순?중량|net.?weight|n\.?w\./i,
  cbm: /cbm|volume|체적|용적/i,
  supplier: /공급사?|supplier|vendor|업체/i,
  poNo: /po.?no|발주번호|order.?no|po.?번호/i,
  remark: /비고|remark|note|memo/i,
};

function matchCol(header: string): keyof typeof COL_KEYWORDS | null {
  for (const [key, re] of Object.entries(COL_KEYWORDS)) {
    if (re.test(header)) return key as keyof typeof COL_KEYWORDS;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab) as unknown as Buffer;

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);

    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: '시트 없음' }, { status: 400 });

    // Find header row (first row containing at least 2 keyword matches)
    let headerRowNum = 1;
    let colMap: Record<string, number> = {};

    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (Object.keys(colMap).length > 0) return; // already found
      const candidates: Record<string, number> = {};
      row.eachCell({ includeEmpty: false }, (cell, colNum) => {
        const val = String(cell.value || '').trim();
        const matched = matchCol(val);
        if (matched) candidates[matched] = colNum;
      });
      if (Object.keys(candidates).length >= 2) {
        headerRowNum = rowNum;
        colMap = candidates;
      }
    });

    // If no header found, try first row
    if (Object.keys(colMap).length === 0) {
      headerRowNum = 1;
      ws.getRow(1).eachCell({ includeEmpty: false }, (cell, colNum) => {
        const val = String(cell.value || '').trim();
        const matched = matchCol(val);
        if (matched) colMap[matched] = colNum;
      });
    }

    // Parse data rows
    const items: CargoItem[] = [];
    let totalGrossWeight = 0;
    let totalCbm = 0;

    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum <= headerRowNum) return;

      const getCellVal = (colKey: keyof typeof COL_KEYWORDS): string => {
        const colNum = colMap[colKey];
        if (!colNum) return '';
        const cell = row.getCell(colNum);
        const v = cell.value;
        if (v === null || v === undefined) return '';
        if (typeof v === 'object' && 'result' in (v as any)) return String((v as any).result ?? '');
        if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text ?? '');
        return String(v).trim();
      };

      const productName = getCellVal('product');
      if (!productName || productName === '합계' || productName === 'Total' || productName === '소계') return;

      const gw = parseFloat(getCellVal('grossWeight')) || 0;
      const cbm = parseFloat(getCellVal('cbm')) || 0;
      totalGrossWeight += gw;
      totalCbm += cbm;

      items.push({
        id: newId(),
        productName,
        supplierName: getCellVal('supplier') || undefined,
        poBusinessId: getCellVal('poNo') || undefined,
        qty: parseFloat(getCellVal('qty')) || undefined,
        grossWeight: gw || undefined,
        netWeight: parseFloat(getCellVal('netWeight')) || undefined,
        cbm: cbm || undefined,
        remark: getCellVal('remark') || undefined,
      });
    });

    return NextResponse.json({
      items,
      totalGrossWeight: Math.round(totalGrossWeight * 100) / 100,
      totalCbm: Math.round(totalCbm * 1000) / 1000,
      headerRow: headerRowNum,
      detectedColumns: colMap,
    });
  } catch (e) {
    console.error('[parse-packing-list]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
