import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { dbToClaim } from '../route';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM claims WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const resolvedAt = body.status === '완료' && !row.resolved_at ? ts : (row.resolved_at ?? null);

    db.prepare(`UPDATE claims SET
      issue_type=?, description=?, status=?,
      customer_id=?, customer_name=?,
      supplier_id=?, supplier_name=?,
      product_id=?, product_name=?,
      po_id=?, po_business_id=?,
      sale_id=?, sale_business_id=?,
      shipment_id=?,
      claim_amount=?, currency=?,
      compensation_type=?, compensation_amount=?,
      resolved_at=?, updated_at=?
      WHERE id=?`)
      .run(
        body.issueType ?? row.issue_type,
        body.description ?? row.description,
        body.status ?? row.status,
        body.customerId ?? row.customer_id ?? null,
        body.customerName ?? row.customer_name ?? null,
        body.supplierId ?? row.supplier_id ?? null,
        body.supplierName ?? row.supplier_name ?? null,
        body.productId ?? row.product_id ?? null,
        body.productName ?? row.product_name ?? null,
        body.poId ?? row.po_id ?? null,
        body.poBusinessId ?? row.po_business_id ?? null,
        body.saleId ?? row.sale_id ?? null,
        body.saleBusinessId ?? row.sale_business_id ?? null,
        body.shipmentId ?? row.shipment_id ?? null,
        body.claimAmount ?? row.claim_amount ?? null,
        body.currency ?? row.currency ?? null,
        body.compensationType ?? row.compensation_type ?? null,
        body.compensationAmount ?? row.compensation_amount ?? null,
        resolvedAt, ts, id,
      );

    const updated = db.prepare('SELECT * FROM claims WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToClaim(updated) });
  } catch (e) {
    console.error('[claims PUT]', e);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM claims WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
