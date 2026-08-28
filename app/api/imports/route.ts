import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { syncImportExpenses, updateLinkedShipmentStatus } from '@/lib/import-helpers';
import { syncIndexOnWrite } from '@/lib/ai/sync';
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
    freightUsd: (row.freight_usd as number) || undefined,
    freightCurrency: (row.freight_currency as string) || 'USD',
    freightExchangeRate: (row.freight_exchange_rate as number) || undefined,
    freightKrw: (row.freight_krw as number) || undefined,
    freightHandling: (() => { try { return JSON.parse((row.freight_handling_json as string) || '[]'); } catch { return []; } })(),
    freightVat: (row.freight_vat as number) || undefined,
    insuranceKrw: (row.insurance_krw as number) || undefined,
    customsValue: (row.customs_value as number) || undefined,
    inspectionFee: (row.inspection_fee as number) || undefined,
    warehouseFee: (row.warehouse_fee as number) || undefined,
    detentionFee: (row.detention_fee as number) || undefined,
    demurrage: (row.demurrage as number) || undefined,
    inlandFreight: (row.inland_freight as number) || undefined,
    brokerFeeVatRate: row.broker_fee_vat_rate !== null && row.broker_fee_vat_rate !== undefined ? (row.broker_fee_vat_rate as number) : 10,
    warehouseFeeVatRate: row.warehouse_fee_vat_rate !== null && row.warehouse_fee_vat_rate !== undefined ? (row.warehouse_fee_vat_rate as number) : 10,
    demurrageVatRate: row.demurrage_vat_rate !== null && row.demurrage_vat_rate !== undefined ? (row.demurrage_vat_rate as number) : 0,
    detentionFeeVatRate: row.detention_fee_vat_rate !== null && row.detention_fee_vat_rate !== undefined ? (row.detention_fee_vat_rate as number) : 0,
    inlandFreightVatRate: row.inland_freight_vat_rate !== null && row.inland_freight_vat_rate !== undefined ? (row.inland_freight_vat_rate as number) : 10,
    inlandFreightRegion: (row.inland_freight_region as string) || undefined,
    inlandCarrierId: (row.inland_carrier_id as string) || undefined,
    inlandCarrierName: (row.inland_carrier_name as string) || undefined,
    inspectionRefund: row.inspection_refund !== null && row.inspection_refund !== undefined ? (row.inspection_refund as number) : undefined,
    customCosts: (() => { try { return JSON.parse((row.custom_costs_json as string) || '[]'); } catch { return []; } })(),
    blNo: (row.bl_no as string) || undefined,
    settlementStatus: ((row.settlement_status as string) || 'open') as 'open' | 'closed',
    settlementItems: (() => { try { return JSON.parse((row.settlement_json as string) || '[]'); } catch { return []; } })(),
    settlementHistory: (() => { try { return JSON.parse((row.settlement_history_json as string) || '[]'); } catch { return []; } })(),
    closedAt: (row.closed_at as string) || undefined,
    closedBy: (row.closed_by as string) || undefined,
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
    refundAmount: (row.refund_amount as number) || undefined,
    refundStatus: (row.refund_status as Import['refundStatus']) || '없음',
    documents: (() => { try { return JSON.parse((row.documents_json as string) || '[]'); } catch { return []; } })(),
    remark: (row.remark as string) || undefined,
    status: (row.status as Import['status']) || 'in_progress',
    supplierName: (row.supplier_name as string) || undefined,
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
    const user = await getSessionUser();
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();
    const bizId = nextBizId('IMP');

    db.prepare(`INSERT INTO imports
      (id,business_id,shipment_id,shipment_business_id,broker_name,declaration_no,
       arrival_date,declaration_date,tax_payment_date,release_date,
       invoice_value,invoice_currency,exchange_rate,freight_usd,freight_currency,freight_exchange_rate,freight_krw,freight_handling_json,freight_vat,insurance_krw,customs_value,
       inspection_fee,inspection_refund,warehouse_fee,detention_fee,demurrage,inland_freight,inland_freight_region,inland_carrier_id,inland_carrier_name,custom_costs_json,
       hs_code,duty_rate,duty,vat,broker_fee,items_json,
       fta_applicable,fta_type,co_status,co_no,inspection_type,
       refund_amount,refund_status,bl_no,documents_json,remark,status,
       broker_fee_vat_rate,warehouse_fee_vat_rate,demurrage_vat_rate,detention_fee_vat_rate,inland_freight_vat_rate,
       created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)

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
        body.freightUsd ?? null,
        body.freightCurrency || 'USD',
        body.freightExchangeRate ?? null,
        body.freightKrw ?? null,
        JSON.stringify(body.freightHandling || []),
        body.freightVat ?? null,
        body.insuranceKrw ?? null,
        body.customsValue ?? null,
        body.inspectionFee ?? null,
        body.inspectionRefund !== undefined ? body.inspectionRefund : null,
        body.warehouseFee ?? null,
        body.detentionFee ?? null,
        body.demurrage ?? null,
        body.inlandFreight ?? null,
        body.inlandFreightRegion ?? null,
        body.inlandCarrierId ?? null,
        body.inlandCarrierName ?? null,
        JSON.stringify(body.customCosts || []),
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
        body.refundAmount ?? null,
        body.refundStatus || '없음',
        body.blNo ?? null,
        '[]',
        body.remark ?? null,
        body.status || 'in_progress',
        body.brokerFeeVatRate ?? 10,
        body.warehouseFeeVatRate ?? 10,
        body.demurrageVatRate ?? 0,
        body.detentionFeeVatRate ?? 0,
        body.inlandFreightVatRate ?? 10,
        ts, ts,
      );

    // 선적 상태 자동 업데이트
    if (body.shipmentId) {
      updateLinkedShipmentStatus(db, body.shipmentId, body.status || 'in_progress');
    }

    // 비용 자동 연동
    syncImportExpenses(db, id, bizId, {
      freightKrw: body.freightKrw,
      freightHandling: body.freightHandling,
      duty: body.duty, vat: body.vat,
      brokerFee: body.brokerFee, inspectionFee: body.inspectionFee,
      warehouseFee: body.warehouseFee, detentionFee: body.detentionFee,
      demurrage: body.demurrage, inlandFreight: body.inlandFreight,
      brokerFeeVatRate: body.brokerFeeVatRate ?? 10,
      warehouseFeeVatRate: body.warehouseFeeVatRate ?? 10,
      demurrageVatRate: body.demurrageVatRate ?? 0,
      detentionFeeVatRate: body.detentionFeeVatRate ?? 0,
      inlandFreightVatRate: body.inlandFreightVatRate ?? 10,
      customCosts: body.customCosts, createdBy: user?.id || 'unknown',
    });

    const row = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown>;
    syncIndexOnWrite('import', id);
    return NextResponse.json({ data: dbToImport(row) }, { status: 201 });
  } catch (e) {
    console.error('[imports POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
