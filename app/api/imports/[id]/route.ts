import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { dbToImport } from '../route';
import { syncImportExpenses, updateLinkedShipmentStatus } from '@/lib/import-helpers';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const row = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    // 마감된 건은 관리자만 수정 가능
    if (row.settlement_status === 'closed' && user?.role !== 'admin') {
      return NextResponse.json({ error: '마감된 통관건은 관리자만 수정할 수 있습니다.' }, { status: 403 });
    }

    db.prepare(`UPDATE imports SET
      shipment_business_id=?, broker_name=?, declaration_no=?,
      arrival_date=?, declaration_date=?, tax_payment_date=?, release_date=?,
      invoice_value=?, invoice_currency=?, exchange_rate=?,
      freight_usd=?, freight_currency=?, freight_exchange_rate=?, freight_krw=?, freight_handling_json=?, freight_vat=?, insurance_krw=?, customs_value=?,
      inspection_fee=?, inspection_refund=?, warehouse_fee=?, detention_fee=?, demurrage=?,
      inland_freight=?, inland_freight_region=?, inland_carrier_id=?, inland_carrier_name=?, custom_costs_json=?,
      hs_code=?, duty_rate=?, duty=?, vat=?, broker_fee=?, items_json=?,
      fta_applicable=?, fta_type=?, co_status=?, co_no=?,
      inspection_type=?, refund_amount=?, refund_status=?, bl_no=?,
      settlement_json=?, remark=?, status=?, updated_at=?
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
        body.freightCurrency ?? row.freight_currency ?? 'USD',
        body.freightExchangeRate ?? row.freight_exchange_rate,
        body.freightKrw ?? row.freight_krw,
        body.freightHandling !== undefined ? JSON.stringify(body.freightHandling) : (row.freight_handling_json ?? '[]'),
        body.freightVat ?? row.freight_vat,
        body.insuranceKrw ?? row.insurance_krw,
        body.customsValue ?? row.customs_value,
        body.inspectionFee ?? row.inspection_fee,
        body.inspectionRefund !== undefined ? body.inspectionRefund : row.inspection_refund,
        body.warehouseFee ?? row.warehouse_fee,
        body.detentionFee ?? row.detention_fee,
        body.demurrage ?? row.demurrage,
        body.inlandFreight ?? row.inland_freight,
        body.inlandFreightRegion ?? row.inland_freight_region,
        body.inlandCarrierId ?? row.inland_carrier_id,
        body.inlandCarrierName ?? row.inland_carrier_name,
        body.customCosts !== undefined ? JSON.stringify(body.customCosts) : (row.custom_costs_json ?? '[]'),
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
        body.refundAmount ?? row.refund_amount,
        body.refundStatus ?? row.refund_status,
        body.blNo ?? row.bl_no,
        body.settlementItems !== undefined ? JSON.stringify(body.settlementItems) : (row.settlement_json ?? '[]'),
        body.remark ?? row.remark,
        body.status ?? row.status,
        now(), id,
      );

    // 선적 상태 자동 업데이트
    const shipmentId = (body.shipmentId || row.shipment_id) as string | undefined;
    updateLinkedShipmentStatus(db, shipmentId, body.status ?? (row.status as string));

    // 비용 자동 연동
    const updated = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown>;
    syncImportExpenses(db, id, row.business_id as string, {
      duty: (body.duty ?? updated.duty) as number | undefined,
      vat: (body.vat ?? updated.vat) as number | undefined,
      brokerFee: (body.brokerFee ?? updated.broker_fee) as number | undefined,
      inspectionFee: (body.inspectionFee ?? updated.inspection_fee) as number | undefined,
      warehouseFee: (body.warehouseFee ?? updated.warehouse_fee) as number | undefined,
      detentionFee: (body.detentionFee ?? updated.detention_fee) as number | undefined,
      demurrage: (body.demurrage ?? updated.demurrage) as number | undefined,
      inlandFreight: (body.inlandFreight ?? updated.inland_freight) as number | undefined,
      customCosts: body.customCosts ?? (() => { try { return JSON.parse((updated.custom_costs_json as string) || '[]'); } catch { return []; } })(),
      createdBy: user?.id || 'unknown',
    });

    return NextResponse.json({ data: dbToImport(updated) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[imports PUT]', msg);
    return NextResponse.json({ error: `수정 실패: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('UPDATE imports SET local_deleted=1, updated_at=? WHERE id=?').run(now(), id);
    // 연동 비용도 함께 삭제
    db.prepare("DELETE FROM expenses WHERE related_type='import' AND related_id=?").run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
