import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export interface OffsetItem {
  poId: string; poBusinessId: string; supplierName: string;
  description: string; qty: number; amount: number; currency: string;
}

export interface CostRecord {
  id: string; businessId: string; costType: string; description?: string;
  shipmentId?: string; shipmentBusinessId?: string;
  importId?: string; importBusinessId?: string;
  poId?: string; poBusinessId?: string;
  clientId?: string; clientName?: string; companyId?: string;
  costAmount: number; costCurrency: string;
  fxRateAtCost?: number; costAmountKrw?: number;
  incurredDate?: string;
  disposition: 'pending' | 'internal' | 'billable_domestic' | 'billable_foreign' | 'offset_purchase';
  billAmount?: number; billCurrency?: string;
  billStatus: 'unbilled' | 'invoiced' | 'collected' | 'offset' | 'waived';
  fxRateAtSettle?: number; fxGainLoss?: number; settledAt?: string;
  linkedInvoiceId?: string; linkedSaleId?: string; linkedExpenseId?: string;
  causeType?: string;
  offsetStatus: 'none' | 'pending' | 'partial' | 'completed';
  offsetRemaining?: number; offsetPoId?: string;
  offsetItems: OffsetItem[];
  allocationGroupId?: string; allocationMethod?: string; allocationRatio?: number;
  isAutoAllocated: boolean;
  remark?: string; createdBy?: string; createdAt: string; updatedAt?: string;
}

export function dbToCostRecord(row: Record<string, unknown>): CostRecord {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    costType: (row.cost_type as string) || 'other',
    description: (row.description as string) || undefined,
    shipmentId: (row.shipment_id as string) || undefined,
    shipmentBusinessId: (row.shipment_business_id as string) || undefined,
    importId: (row.import_id as string) || undefined,
    importBusinessId: (row.import_business_id as string) || undefined,
    poId: (row.po_id as string) || undefined,
    poBusinessId: (row.po_business_id as string) || undefined,
    clientId: (row.client_id as string) || undefined,
    clientName: (row.client_name as string) || undefined,
    companyId: (row.company_id as string) || undefined,
    costAmount: (row.cost_amount as number) || 0,
    costCurrency: (row.cost_currency as string) || 'KRW',
    fxRateAtCost: (row.fx_rate_at_cost as number) || undefined,
    costAmountKrw: (row.cost_amount_krw as number) || undefined,
    incurredDate: (row.incurred_date as string) || undefined,
    disposition: (row.disposition as CostRecord['disposition']) || 'pending',
    billAmount: (row.bill_amount as number) || undefined,
    billCurrency: (row.bill_currency as string) || 'KRW',
    billStatus: (row.bill_status as CostRecord['billStatus']) || 'unbilled',
    fxRateAtSettle: (row.fx_rate_at_settle as number) || undefined,
    fxGainLoss: (row.fx_gain_loss as number) || undefined,
    settledAt: (row.settled_at as string) || undefined,
    linkedInvoiceId: (row.linked_invoice_id as string) || undefined,
    linkedSaleId: (row.linked_sale_id as string) || undefined,
    linkedExpenseId: (row.linked_expense_id as string) || undefined,
    causeType: (row.cause_type as string) || 'schedule',
    offsetStatus: (row.offset_status as CostRecord['offsetStatus']) || 'none',
    offsetRemaining: (row.offset_remaining as number) || undefined,
    offsetPoId: (row.offset_po_id as string) || undefined,
    offsetItems: (() => { try { return JSON.parse((row.offset_items_json as string) || '[]'); } catch { return []; } })(),
    allocationGroupId: (row.allocation_group_id as string) || undefined,
    allocationMethod: (row.allocation_method as string) || undefined,
    allocationRatio: (row.allocation_ratio as number) || undefined,
    isAutoAllocated: Boolean(row.is_auto_allocated),
    remark: (row.remark as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) || undefined,
  };
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const importId = url.searchParams.get('importId');
  const shipmentId = url.searchParams.get('shipmentId');
  const disposition = url.searchParams.get('disposition');
  const billStatus = url.searchParams.get('billStatus');
  const costType = url.searchParams.get('costType');

  let query = 'SELECT * FROM cost_records WHERE 1=1';
  const params: unknown[] = [];

  if (importId) { query += ' AND import_id=?'; params.push(importId); }
  if (shipmentId) { query += ' AND shipment_id=?'; params.push(shipmentId); }
  if (disposition) { query += ' AND disposition=?'; params.push(disposition); }
  if (billStatus) { query += ' AND bill_status=?'; params.push(billStatus); }
  if (costType) { query += ' AND cost_type=?'; params.push(costType); }

  query += ' ORDER BY incurred_date DESC, created_at DESC';

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToCostRecord) });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const bizId = nextBizId('CST');
    const ts = now();

    const costAmountKrw = body.costCurrency === 'KRW'
      ? body.costAmount
      : (body.costAmount || 0) * (body.fxRateAtCost || 1);

    db.prepare(`INSERT INTO cost_records
      (id,business_id,cost_type,description,
       shipment_id,shipment_business_id,import_id,import_business_id,po_id,po_business_id,
       client_id,client_name,company_id,
       cost_amount,cost_currency,fx_rate_at_cost,cost_amount_krw,
       incurred_date,disposition,bill_amount,bill_currency,bill_status,
       cause_type,offset_status,offset_remaining,offset_po_id,offset_items_json,
       linked_sale_id,allocation_method,remark,
       is_auto_allocated,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id, bizId,
        body.costType || 'other', body.description ?? null,
        body.shipmentId ?? null, body.shipmentBusinessId ?? null,
        body.importId ?? null, body.importBusinessId ?? null,
        body.poId ?? null, body.poBusinessId ?? null,
        body.clientId ?? null, body.clientName ?? null, body.companyId ?? null,
        body.costAmount || 0, body.costCurrency || 'KRW',
        body.fxRateAtCost ?? 1, costAmountKrw,
        body.incurredDate ?? ts.slice(0, 10),
        body.disposition || 'pending',
        body.billAmount ?? null, body.billCurrency || 'KRW',
        body.billStatus || 'unbilled',
        body.causeType || 'schedule',
        body.offsetStatus || 'none',
        body.offsetRemaining ?? null, body.offsetPoId ?? null,
        JSON.stringify(body.offsetItems || []),
        body.linkedSaleId ?? null,
        body.allocationMethod ?? null,
        body.remark ?? null,
        0, user?.id || 'unknown', ts, ts,
      );

    const row = db.prepare('SELECT * FROM cost_records WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToCostRecord(row) }, { status: 201 });
  } catch (e) {
    console.error('[cost-records POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
