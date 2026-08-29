import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { dbToCostRecord } from '../route';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM cost_records WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });
  return NextResponse.json({ data: dbToCostRecord(row) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const row = db.prepare('SELECT * FROM cost_records WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    // 수정 잠금: 익월 10일 이후는 관리자만 수정 가능
    const createdAt = new Date(row.created_at as string);
    const lockDate = new Date(createdAt.getFullYear(), createdAt.getMonth() + 1, 10); // 익월 10일
    const isLocked = new Date() > lockDate;
    if (isLocked) {
      const user = await getSessionUser();
      if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: '마감된 비용은 관리자만 수정할 수 있습니다. (익월 10일 마감)' }, { status: 403 });
      }
    }

    const costAmountKrw = (body.costCurrency || row.cost_currency) === 'KRW'
      ? (body.costAmount ?? row.cost_amount)
      : (body.costAmount ?? row.cost_amount as number) * (body.fxRateAtCost ?? (row.fx_rate_at_cost as number) ?? 1);

    // 상계 잔액 자동 계산
    let offsetRemaining = body.offsetRemaining ?? row.offset_remaining;
    const newBillStatus = body.billStatus ?? row.bill_status;
    if (newBillStatus === 'offset') {
      offsetRemaining = 0;
    }

    // FX 손익 자동 계산 (정산 시)
    let fxGainLoss = body.fxGainLoss ?? row.fx_gain_loss;
    if (body.fxRateAtSettle && body.billCurrency !== 'KRW') {
      const billAmt = body.billAmount ?? row.bill_amount as number ?? 0;
      const origKrw = billAmt * ((row.fx_rate_at_cost as number) ?? 1);
      const settleKrw = billAmt * body.fxRateAtSettle;
      fxGainLoss = Math.round(settleKrw - origKrw);
    }

    db.prepare(`UPDATE cost_records SET
      cost_type=?, description=?,
      client_id=?, client_name=?, company_id=?,
      vendor_id=?, vendor_name=?,
      shipment_id=?, shipment_business_id=?,
      import_id=?, import_business_id=?,
      po_id=?, po_business_id=?,
      cost_amount=?, cost_currency=?, fx_rate_at_cost=?, cost_amount_krw=?,
      incurred_date=?, disposition=?,
      bill_amount=?, bill_currency=?, bill_status=?,
      fx_rate_at_settle=?, fx_gain_loss=?, settled_at=?,
      linked_invoice_id=?, linked_sale_id=?, linked_sales_json=?,
      cause_type=?,
      offset_status=?, offset_remaining=?, offset_po_id=?, offset_items_json=?,
      cost_items_json=?, line_items_json=?,
      allocation_method=?, allocation_ratio=?,
      paid_amount_krw=?, payment_memo=?, journal_entry_id=?,
      remark=?, updated_at=?
      WHERE id=?`)
      .run(
        body.costType ?? row.cost_type,
        body.description ?? row.description,
        body.clientId ?? row.client_id,
        body.clientName ?? row.client_name,
        body.companyId ?? row.company_id,
        body.vendorId ?? row.vendor_id,
        body.vendorName ?? row.vendor_name,
        body.shipmentId ?? row.shipment_id,
        body.shipmentBusinessId ?? row.shipment_business_id,
        body.importId ?? row.import_id,
        body.importBusinessId ?? row.import_business_id,
        body.poId ?? row.po_id,
        body.poBusinessId ?? row.po_business_id,
        body.costAmount ?? row.cost_amount,
        body.costCurrency ?? row.cost_currency,
        body.fxRateAtCost ?? row.fx_rate_at_cost,
        costAmountKrw,
        body.incurredDate ?? row.incurred_date,
        body.disposition ?? row.disposition,
        body.billAmount ?? row.bill_amount,
        body.billCurrency ?? row.bill_currency,
        newBillStatus,
        body.fxRateAtSettle ?? row.fx_rate_at_settle,
        fxGainLoss,
        body.settledAt ?? row.settled_at,
        body.linkedInvoiceId ?? row.linked_invoice_id,
        body.linkedSaleId ?? row.linked_sale_id,
        body.linkedSales !== undefined ? JSON.stringify(body.linkedSales) : (row.linked_sales_json ?? '[]'),
        body.causeType ?? row.cause_type,
        body.offsetStatus ?? row.offset_status,
        offsetRemaining,
        body.offsetPoId ?? row.offset_po_id,
        body.offsetItems !== undefined ? JSON.stringify(body.offsetItems) : (row.offset_items_json ?? '[]'),
        body.costItems !== undefined ? JSON.stringify(body.costItems) : (row.cost_items_json ?? '[]'),
        body.lineItems !== undefined ? JSON.stringify(body.lineItems) : (row.line_items_json ?? '[]'),
        body.allocationMethod ?? row.allocation_method,
        body.allocationRatio ?? row.allocation_ratio,
        body.paidAmountKrw !== undefined ? body.paidAmountKrw : (row.paid_amount_krw ?? null),
        body.paymentMemo !== undefined ? body.paymentMemo : (row.payment_memo ?? null),
        body.journalEntryId !== undefined ? body.journalEntryId : (row.journal_entry_id ?? null),
        body.remark ?? row.remark,
        now(), id,
      );

    const updated = db.prepare('SELECT * FROM cost_records WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToCostRecord(updated) });
  } catch (e) {
    console.error('[cost-records PUT]', e);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT is_auto_allocated FROM cost_records WHERE id=?').get(id) as { is_auto_allocated: number } | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    if (row.is_auto_allocated) {
      const user = await getSessionUser();
      if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: '자동 생성 비용은 관리자만 삭제할 수 있습니다.' }, { status: 403 });
      }
    }
    db.prepare('DELETE FROM cost_records WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
