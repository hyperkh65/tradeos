import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { dbToImport } from '../route';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const row = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    db.prepare(`UPDATE imports SET
      shipment_business_id=?, broker_name=?, declaration_no=?,
      arrival_date=?, declaration_date=?, tax_payment_date=?, release_date=?,
      invoice_value=?, invoice_currency=?, exchange_rate=?,
      freight_usd=?, freight_exchange_rate=?, freight_krw=?, insurance_krw=?, customs_value=?, inspection_fee=?,
      hs_code=?, duty_rate=?, duty=?, vat=?, broker_fee=?, items_json=?,
      fta_applicable=?, fta_type=?, co_status=?, co_no=?,
      inspection_type=?, remark=?, status=?, updated_at=?
      WHERE id=?`)
      .run(
        body.shipmentBusinessId ?? row.shipment_business_id,
        body.brokerName ?? row.broker_name,
        body.declarationNo ?? row.declaration_no,
        body.arrivalDate ?? row.arrival_date,
        body.declarationDate ?? row.declaration_date,
        body.taxPaymentDate ?? row.tax_payment_date,
        body.releaseDate ?? row.release_date,
        body.invoiceValue ?? row.invoice_value,
        body.invoiceCurrency ?? row.invoice_currency,
        body.exchangeRate ?? row.exchange_rate,
        body.freightUsd ?? row.freight_usd,
        body.freightExchangeRate ?? row.freight_exchange_rate,
        body.freightKrw ?? row.freight_krw,
        body.insuranceKrw ?? row.insurance_krw,
        body.customsValue ?? row.customs_value,
        body.inspectionFee ?? row.inspection_fee,
        body.hsCode ?? row.hs_code,
        body.dutyRate ?? row.duty_rate,
        body.duty ?? row.duty,
        body.vat ?? row.vat,
        body.brokerFee ?? row.broker_fee,
        body.items !== undefined ? JSON.stringify(body.items) : (row.items_json ?? '[]'),
        body.ftaApplicable !== undefined ? (body.ftaApplicable ? 1 : 0) : row.fta_applicable,
        body.ftaType ?? row.fta_type,
        body.coStatus ?? row.co_status,
        body.coNo ?? row.co_no,
        body.inspectionType ?? row.inspection_type,
        body.remark ?? row.remark,
        body.status ?? row.status,
        now(), id,
      );

    const updated = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToImport(updated) });
  } catch (e) {
    console.error('[imports PUT]', e);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('UPDATE imports SET local_deleted=1, updated_at=? WHERE id=?').run(now(), id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
