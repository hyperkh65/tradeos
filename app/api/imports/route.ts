import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import type { Import } from '@/types';

export function dbToImport(row: Record<string, unknown>): Import {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    shipmentId: (row.shipment_id as string) || '',
    shipmentBusinessId: (row.shipment_business_id as string) || '',
    brokerName: (row.broker_name as string) || undefined,
    declarationNo: (row.declaration_no as string) || undefined,
    arrivalDate: (row.arrival_date as string) || undefined,
    declarationDate: (row.declaration_date as string) || undefined,
    taxPaymentDate: (row.tax_payment_date as string) || undefined,
    releaseDate: (row.release_date as string) || undefined,
    invoiceValue: (row.invoice_value as number) || undefined,
    invoiceCurrency: (row.invoice_currency as string) || 'USD',
    exchangeRate: (row.exchange_rate as number) || undefined,
    freightKrw: (row.freight_krw as number) || undefined,
    insuranceKrw: (row.insurance_krw as number) || undefined,
    customsValue: (row.customs_value as number) || undefined,
    hsCode: (row.hs_code as string) || undefined,
    dutyRate: (row.duty_rate as number) || undefined,
    duty: (row.duty as number) || undefined,
    vat: (row.vat as number) || undefined,
    brokerFee: (row.broker_fee as number) || undefined,
    items: (() => { try { return JSON.parse((row.items_json as string) || '[]'); } catch { return []; } })(),
    ftaApplicable: Boolean(row.fta_applicable),
    ftaType: (row.fta_type as string) || undefined,
    coStatus: (row.co_status as Import['coStatus']) || undefined,
    coNo: (row.co_no as string) || undefined,
    inspectionType: (row.inspection_type as Import['inspectionType']) || 'none',
    documents: (() => { try { return JSON.parse((row.documents_json as string) || '[]'); } catch { return []; } })(),
    remark: (row.remark as string) || undefined,
    status: (row.status as Import['status']) || 'in_progress',
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) || undefined,
  };
}

export async function GET() {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM imports WHERE local_deleted=0 OR local_deleted IS NULL ORDER BY created_at DESC"
  ).all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToImport) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM imports WHERE business_id LIKE 'IMP-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g, '') || '0') : 0;
    const year = new Date().getFullYear();
    const bizId = `IMP-${year}-${String(lastNum + 1).padStart(4, '0')}`;

    db.prepare(`INSERT INTO imports
      (id,business_id,shipment_id,shipment_business_id,broker_name,declaration_no,
       arrival_date,declaration_date,tax_payment_date,release_date,
       invoice_value,invoice_currency,exchange_rate,freight_krw,insurance_krw,customs_value,
       hs_code,duty_rate,duty,vat,broker_fee,items_json,
       fta_applicable,fta_type,co_status,co_no,inspection_type,
       documents_json,remark,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id, bizId,
        body.shipmentId || '',
        body.shipmentBusinessId || '',
        body.brokerName ?? null,
        body.declarationNo ?? null,
        body.arrivalDate ?? null,
        body.declarationDate ?? null,
        body.taxPaymentDate ?? null,
        body.releaseDate ?? null,
        body.invoiceValue ?? null,
        body.invoiceCurrency || 'USD',
        body.exchangeRate ?? null,
        body.freightKrw ?? null,
        body.insuranceKrw ?? null,
        body.customsValue ?? null,
        body.hsCode ?? null,
        body.dutyRate ?? null,
        body.duty ?? null,
        body.vat ?? null,
        body.brokerFee ?? null,
        JSON.stringify(body.items || []),
        body.ftaApplicable ? 1 : 0,
        body.ftaType ?? null,
        body.coStatus ?? null,
        body.coNo ?? null,
        body.inspectionType || 'none',
        '[]',
        body.remark ?? null,
        body.status || 'in_progress',
        ts, ts,
      );

    const row = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToImport(row) }, { status: 201 });
  } catch (e) {
    console.error('[imports POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
