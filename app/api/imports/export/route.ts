import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { dbToImport } from '../route';

export async function GET() {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM imports WHERE local_deleted=0 OR local_deleted IS NULL ORDER BY created_at DESC"
  ).all() as Record<string, unknown>[];

  const imports = rows.map(dbToImport);

  const headers = [
    '통관번호', '선적번호', '관세사', '신고번호',
    '입항일', '신고일', '납세일', '반출일',
    '인보이스금액', '통화', '환율',
    '운임USD', '운임환율', '운임KRW', '보험료KRW',
    '과세가격', 'HSCode', '관세율',
    '관세', '부가세', '세관검사비', '통관비', '창고비', '내륙운송비',
    '총납부', '환급액', '환급상태',
    'FTA적용', 'FTA협정', 'C/O상태', 'C/O번호',
    '세관검사유형', '상태', '비고',
  ];

  const rows2 = imports.map(i => {
    const total = (i.duty || 0) + (i.vat || 0) + (i.brokerFee || 0)
      + (i.inspectionFee || 0) + (i.warehouseFee || 0) + (i.inlandFreight || 0);
    return [
      i.businessId, i.shipmentBusinessId, i.brokerName || '', i.declarationNo || '',
      i.arrivalDate || '', i.declarationDate || '', i.taxPaymentDate || '', i.releaseDate || '',
      i.invoiceValue ?? '', i.invoiceCurrency || 'USD', i.exchangeRate ?? '',
      i.freightUsd ?? '', i.freightExchangeRate ?? '', i.freightKrw ?? '', i.insuranceKrw ?? '',
      i.customsValue ?? '', i.hsCode || '', i.dutyRate ?? '',
      i.duty ?? '', i.vat ?? '', i.inspectionFee ?? '', i.brokerFee ?? '',
      i.warehouseFee ?? '', i.inlandFreight ?? '',
      total, i.refundAmount ?? '', i.refundStatus || '없음',
      i.ftaApplicable ? 'Y' : 'N', i.ftaType || '', i.coStatus || '', i.coNo || '',
      i.inspectionType || 'none', i.status, i.remark || '',
    ];
  });

  const csv = [headers, ...rows2]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const bom = '﻿'; // UTF-8 BOM for Excel
  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="imports_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
