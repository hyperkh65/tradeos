import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import ExcelJS from 'exceljs';

function fmt(n: number) { return Math.round(n); }

type BorderStyle = 'thin' | 'medium' | 'thick';
const B = (s: BorderStyle = 'thin'): ExcelJS.Border => ({ style: s, color: { argb: 'FF888888' } });
const bAll = { top: B(), left: B(), bottom: B(), right: B() };
const bAllMed = { top: B('medium'), left: B('medium'), bottom: B('medium'), right: B('medium') };

function applyBorder(cell: ExcelJS.Cell, border = bAll) {
  cell.border = border;
}

function setCell(
  row: ExcelJS.Row,
  col: number,
  value: ExcelJS.CellValue,
  opts: {
    bold?: boolean;
    align?: ExcelJS.Alignment['horizontal'];
    fill?: string;
    color?: string;
    italic?: boolean;
    size?: number;
    border?: ExcelJS.Borders;
    numFmt?: string;
  } = {}
) {
  const cell = row.getCell(col);
  cell.value = value;
  cell.border = opts.border ?? bAll;
  cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', wrapText: true };
  const font: Partial<ExcelJS.Font> = { bold: !!opts.bold, size: opts.size ?? 10, italic: !!opts.italic };
  if (opts.color) font.color = { argb: 'FF' + opts.color };
  cell.font = font;
  if (opts.fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + opts.fill } };
  }
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM profit_analyses WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const pa = {
    title: row.title as string,
    analysisDate: (row.analysis_date as string) || '',
    customerName: (row.customer_name as string) || '',
    supplierName: (row.supplier_name as string) || '',
    importBusinessId: (row.import_business_id as string) || '',
    saleAmount: (row.sale_amount as number) || 0,
    customsExRate: (row.customs_ex_rate as number) || 0,
    wireExRate: (row.wire_ex_rate as number) || 0,
    freightCost: (row.freight_cost as number) || 0,
    inlandFreight: (row.inland_freight as number) || 0,
    brokerFee: (row.broker_fee as number) || 0,
    duty: (row.duty as number) || 0,
    vatImport: (row.vat_import as number) || 0,
    wireFee: (row.wire_fee as number) || 0,
    advancePayment: (row.advance_payment as number) || 0,
    paymentAmount: (row.payment_amount as number) || 0,
    actualPayment: (row.actual_payment as number) || 0,
    productItems: (() => { try { return JSON.parse((row.product_items_json as string) || '[]'); } catch { return []; } })() as { name: string; spec?: string; qty: number; unitPriceFx: number; currency: string; totalKrwManual?: number }[],
    extraCosts: (() => { try { return JSON.parse((row.extra_costs_json as string) || '[]'); } catch { return []; } })() as { name: string; amount: number }[],
  };

  const cex = pa.customsExRate || 1;
  const wex = pa.wireExRate || cex;

  let productTotal = 0;
  let rmbTotal = 0;
  for (const p of pa.productItems) {
    if (p.totalKrwManual) {
      productTotal += p.totalKrwManual;
    } else {
      productTotal += Math.round((p.qty || 0) * (p.unitPriceFx || 0) * wex);
      rmbTotal += (p.qty || 0) * (p.unitPriceFx || 0);
    }
  }

  const logisticTotal = (pa.freightCost || 0) + (pa.inlandFreight || 0) + (pa.brokerFee || 0) + (pa.duty || 0) + (pa.wireFee || 0) + (pa.extraCosts || []).reduce((s: number, c: { amount: number }) => s + (c.amount || 0), 0);
  const totalCost = productTotal + logisticTotal;
  const profit = pa.saleAmount - totalCost;
  const profitRate = pa.saleAmount > 0 ? (profit / pa.saleAmount) * 100 : 0;
  const effectivePayment = pa.paymentAmount > 0 ? pa.paymentAmount : productTotal;
  const actualCalc = effectivePayment - pa.advancePayment;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LOOV ERP';
  const ws = wb.addWorksheet('정산서');

  // 컬럼 너비
  ws.columns = [
    { width: 38 }, // A: 항목
    { width: 12 }, // B: 수량
    { width: 20 }, // C: KRW
    { width: 16 }, // D: RMB
    { width: 10 }, // E: 비고
  ];

  let r = 1;

  // ── 헤더
  const h1 = ws.getRow(r++);
  h1.height = 22;
  ws.mergeCells(`A${r - 1}:E${r - 1}`);
  const hCell = h1.getCell(1);
  const headerText = `${pa.customerName ? pa.customerName + ' / ' : ''}수익분석 예상 ${pa.analysisDate} 납품`;
  hCell.value = headerText;
  hCell.font = { bold: true, size: 13 };
  hCell.alignment = { horizontal: 'center', vertical: 'middle' };
  hCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } };
  hCell.border = bAllMed;

  const h2 = ws.getRow(r++);
  h2.height = 16;
  ws.mergeCells(`A${r - 1}:E${r - 1}`);
  const titleCell = h2.getCell(1);
  titleCell.value = pa.title;
  titleCell.font = { bold: true, size: 11 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
  titleCell.border = bAll;

  // 컬럼 헤더
  const colH = ws.getRow(r++);
  colH.height = 15;
  ['항목', '수량', 'KRW', 'RMB', '비고'].forEach((v, i) => {
    setCell(colH, i + 1, v, { bold: true, align: 'center', fill: 'DDDDDD' });
  });

  // 1. 매출금액
  const saleR = ws.getRow(r++);
  saleR.height = 18;
  const deliveryLabel = pa.analysisDate
    ? `${pa.analysisDate.slice(0, 4)}년 ${parseInt(pa.analysisDate.slice(5, 7))}월 납품분`
    : '';
  setCell(saleR, 1, `1. 매출금액  원${deliveryLabel ? '  (' + deliveryLabel + ')' : ''}`, { bold: true });
  setCell(saleR, 2, '', { bold: true });
  setCell(saleR, 3, fmt(pa.saleAmount), { bold: true, align: 'right', numFmt: '#,##0' });
  setCell(saleR, 4, '');
  setCell(saleR, 5, '부가세 별도', { align: 'center', color: '888888', size: 9 });

  // 2. 비용 섹션 헤더
  const costH = ws.getRow(r++);
  ws.mergeCells(`A${r - 1}:E${r - 1}`);
  setCell(costH, 1, '2. 비용', { bold: true, fill: 'F5F5F5' });

  // 2-1) 제품공가
  if (pa.productItems.length > 0) {
    const prodH = ws.getRow(r++);
    setCell(prodH, 1, `  2-1) 제품공가${pa.supplierName ? '  ' + pa.supplierName : ''}`, { bold: true, fill: 'FAFAFA' });
    setCell(prodH, 2, '수량', { align: 'center', fill: 'FAFAFA', color: '888888' });
    setCell(prodH, 3, '', { fill: 'FAFAFA' });
    setCell(prodH, 4, '', { fill: 'FAFAFA' });
    setCell(prodH, 5, '', { fill: 'FAFAFA' });

    // 환율 행
    if (cex > 1 || wex > 1) {
      const exRow = ws.getRow(r++);
      ws.mergeCells(`A${r - 1}:E${r - 1}`);
      setCell(exRow, 1,
        `  적용환율 — ①통관: ${cex.toLocaleString()}원/CNY    ②송금: ${wex !== cex ? wex.toLocaleString() + '원/CNY' : '①과 동일'}${pa.importBusinessId ? '    (' + pa.importBusinessId + ')' : ''}`,
        { color: 'B45309', fill: 'FFFBEB', size: 9, italic: true }
      );
    }

    // 제품 행
    const dateStr = pa.analysisDate
      ? `${new Date(pa.analysisDate).getMonth() + 1}/${new Date(pa.analysisDate).getDate()}`
      : '';
    for (const p of pa.productItems) {
      const t1 = p.totalKrwManual ?? Math.round((p.qty || 0) * (p.unitPriceFx || 0) * cex);
      const rmb = p.totalKrwManual ? null : (p.qty || 0) * (p.unitPriceFx || 0);
      const pRow = ws.getRow(r++);
      pRow.height = 28;
      setCell(pRow, 1, `    ${dateStr}  ${p.name}${p.spec ? ' ' + p.spec : ''}`);
      setCell(pRow, 2, p.qty || 0, { align: 'center' });
      setCell(pRow, 3, t1 || '', { align: 'right', numFmt: '#,##0' });
      setCell(pRow, 4, rmb != null ? `¥ ${rmb.toFixed(2)}` : '', { align: 'right' });
      setCell(pRow, 5, '');
    }

    // 제품원가 소계
    const subtR = ws.getRow(r++);
    subtR.height = 16;
    setCell(subtR, 1, '    제품원가 소계 (②송금환율 기준)', { bold: true, fill: 'FEFCE8' });
    setCell(subtR, 2, '', { fill: 'FEFCE8' });
    setCell(subtR, 3, fmt(productTotal), { bold: true, align: 'right', fill: 'FEFCE8', numFmt: '#,##0' });
    setCell(subtR, 4, rmbTotal > 0 ? `¥ ${rmbTotal.toFixed(2)}` : '', { align: 'right', fill: 'FEFCE8' });
    setCell(subtR, 5, '', { fill: 'FEFCE8' });
  }

  // 빈 행
  const blk1 = ws.getRow(r++);
  for (let c = 1; c <= 5; c++) applyBorder(blk1.getCell(c));

  // 2) 비용 합계
  const logH = ws.getRow(r++);
  logH.height = 16;
  setCell(logH, 1, '  2) 비용 합계', { bold: true, fill: 'F5F5F5' });
  setCell(logH, 2, '', { fill: 'F5F5F5' });
  setCell(logH, 3, fmt(logisticTotal), { bold: true, align: 'right', fill: 'F5F5F5', numFmt: '#,##0' });
  setCell(logH, 4, '', { fill: 'F5F5F5' });
  setCell(logH, 5, '부가세 제외', { align: 'center', fill: 'F5F5F5', color: '888888', size: 9 });

  // 물류비용 상세
  const costItems = [
    { label: '포워더운임', val: pa.freightCost },
    { label: '내륙운송료', val: pa.inlandFreight },
    { label: '통관수수료', val: pa.brokerFee },
    { label: '관세', val: pa.duty },
    { label: '해외송금수수료', val: pa.wireFee },
    ...(pa.extraCosts || []).filter((c: { amount: number }) => c.amount > 0).map((c: { name: string; amount: number }) => ({ label: c.name, val: c.amount })),
  ];
  for (const { label, val } of costItems) {
    const cRow = ws.getRow(r++);
    setCell(cRow, 1, `    ${label}`);
    setCell(cRow, 2, '');
    setCell(cRow, 3, val > 0 ? fmt(val) : '', { align: 'right', numFmt: '#,##0' });
    setCell(cRow, 4, '');
    setCell(cRow, 5, '');
  }

  // 부가세 (별도)
  if (pa.vatImport > 0) {
    const vatR = ws.getRow(r++);
    setCell(vatR, 1, '    부가세 (별도)', { italic: true, color: '888888' });
    setCell(vatR, 2, '', { color: '888888' });
    setCell(vatR, 3, fmt(pa.vatImport), { align: 'right', color: '888888', numFmt: '#,##0' });
    setCell(vatR, 4, '');
    setCell(vatR, 5, '별도/불포함', { align: 'center', color: '888888', size: 9, italic: true });
  }

  // 빈 행
  const blk2 = ws.getRow(r++);
  for (let c = 1; c <= 5; c++) applyBorder(blk2.getCell(c));

  // 3. 수익
  const profitFill = profit >= 0 ? 'EFF6FF' : 'FEF2F2';
  const profitColor = profit >= 0 ? '1D4ED8' : 'DC2626';
  const profRow = ws.getRow(r++);
  profRow.height = 20;
  setCell(profRow, 1, '3. 수익', { bold: true, fill: profitFill });
  setCell(profRow, 2, '', { fill: profitFill });
  setCell(profRow, 3, fmt(Math.abs(profit)) * (profit >= 0 ? 1 : -1), { bold: true, align: 'right', fill: profitFill, color: profitColor, size: 12, numFmt: '#,##0' });
  setCell(profRow, 4, '', { fill: profitFill });
  setCell(profRow, 5, '부가세 별도', { align: 'center', fill: profitFill, color: '888888', size: 9 });

  const rateRow = ws.getRow(r++);
  setCell(rateRow, 1, `${profitRate.toFixed(2)}`, { align: 'right', fill: profitFill + '80', color: profitColor, bold: true });
  setCell(rateRow, 2, '수익률 %', { fill: profitFill + '80', color: profitColor });
  setCell(rateRow, 3, `매출 ${pa.saleAmount.toLocaleString()} − 총비용 ${totalCost.toLocaleString()}`, { fill: profitFill + '80', color: '888888', size: 9 });
  setCell(rateRow, 4, '', { fill: profitFill + '80' });
  setCell(rateRow, 5, '', { fill: profitFill + '80' });
  ws.mergeCells(`C${r - 1}:E${r - 1}`);

  // 빈 행
  const blk3 = ws.getRow(r++);
  for (let c = 1; c <= 5; c++) applyBorder(blk3.getCell(c));

  // 4. 선지급비용
  const adv = ws.getRow(r++);
  adv.height = 18;
  setCell(adv, 1, '4. 선지급비용', { bold: true });
  setCell(adv, 2, '보증금 등', { align: 'center', color: '888888', size: 9 });
  setCell(adv, 3, pa.advancePayment > 0 ? fmt(pa.advancePayment) : '', { align: 'right', numFmt: '#,##0' });
  setCell(adv, 4, '');
  setCell(adv, 5, '원');

  // 5. 지급액
  const pay = ws.getRow(r++);
  pay.height = 18;
  setCell(pay, 1, '5. 지급액', { bold: true });
  setCell(pay, 2, '총 청구액', { align: 'center', color: '888888', size: 9 });
  setCell(pay, 3, effectivePayment > 0 ? fmt(effectivePayment) : '', { align: 'right', numFmt: '#,##0' });
  setCell(pay, 4, pa.paymentAmount === 0 && productTotal > 0 ? '(제품원가② 기준)' : '', { color: '888888', size: 9 });
  setCell(pay, 5, '원');

  // 6. 실지급액
  const actR = ws.getRow(r++);
  actR.height = 20;
  setCell(actR, 1, '6. 실지급액', { bold: true, fill: 'FFF7ED' });
  setCell(actR, 2, '⑤−④', { align: 'center', fill: 'FFF7ED', color: '888888', size: 9 });
  setCell(actR, 3, actualCalc !== 0 ? fmt(actualCalc) : '', { bold: true, align: 'right', fill: 'FFF7ED', color: 'EA580C', numFmt: '#,##0' });
  setCell(actR, 4, '', { fill: 'FFF7ED' });
  setCell(actR, 5, '원', { fill: 'FFF7ED' });

  // ── 출력
  const buf = await wb.xlsx.writeBuffer();
  const filename = encodeURIComponent(`정산서_${pa.analysisDate}_${pa.title}.xlsx`);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
