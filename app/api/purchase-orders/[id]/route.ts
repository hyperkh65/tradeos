import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { updateNotionPurchaseOrder, deleteNotionPurchaseOrder } from '@/lib/notion/mapper';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();

    const row = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const items = body.items || JSON.parse((row.items_json as string) || '[]');
    const total = items.reduce((s: number, i: { amount: number }) => s + (i.amount || 0), 0);
    const supplierName = body.supplierName || row.supplier_name;
    const currency = body.currency || row.currency;
    const orderDate = body.orderDate || row.order_date;
    const status = body.status || row.status;
    const businessId = row.business_id as string;

    // Append revision snapshot (previous state before this edit)
    const existingRevs: any[] = JSON.parse((row.revisions_json as string) || '[]');
    existingRevs.push({
      rev: existingRevs.length + 1,
      date: ts,
      snapshot: {
        supplierName: row.supplier_name,
        currency: row.currency,
        totalAmount: row.total_amount,
        status: row.status,
        etd: row.etd,
        orderDate: row.order_date,
      },
    });
    const revisionsJson = JSON.stringify(existingRevs);

    // Auto-confirm: draft → confirmed when PI number is set
    const newPiNumber = body.piNumber !== undefined ? body.piNumber : (row.pi_number ?? null);
    const autoStatus = (status === 'draft' || row.status === 'draft') && newPiNumber ? 'confirmed' : status;

    const customerId = body.customerId !== undefined ? body.customerId : (row.customer_id ?? null);
    const customerName = body.customerName !== undefined ? body.customerName : (row.customer_name ?? null);

    db.prepare(`UPDATE purchase_orders SET supplier_name=?,items_json=?,currency=?,total_amount=?,deposit_amount=?,balance_amount=?,payment_terms=?,order_date=?,production_due_date=?,inspection_date=?,etd=?,status=?,incoterm=?,remark=?,updated_at=?,images_json=?,deposit_ratio=?,revisions_json=?,pi_number=?,pi_file_url=?,pi_stamped_url=?,customer_id=?,customer_name=? WHERE id=?`)
      .run(supplierName, JSON.stringify(items), currency, total, body.depositAmount ?? null, body.balanceAmount ?? null, body.paymentTerms ?? null, orderDate, body.productionDueDate ?? null, body.inspectionDate ?? null, body.etd ?? null, autoStatus, body.incoterm ?? null, body.remark ?? null, ts, body.imagesJson ?? row.images_json ?? null, body.depositRatio ?? row.deposit_ratio ?? '30', revisionsJson, newPiNumber, body.piFileUrl !== undefined ? body.piFileUrl : (row.pi_file_url ?? null), body.piStampedUrl !== undefined ? body.piStampedUrl : (row.pi_stamped_url ?? null), customerId, customerName, id);

    // Sync to Notion (ERP)
    await updateNotionPurchaseOrder(businessId, {
      id, businessId, supplierId: (row.supplier_id as string) || '',
      supplierName, items, currency, totalAmount: total,
      orderDate, status, incoterm: body.incoterm, remark: body.remark,
      createdBy: (row.created_by as string) || 'user-1',
      createdAt: row.created_at as string, updatedAt: ts,
    }).catch(e => console.error('[PO] Notion update error:', e));

    return NextResponse.json({ data: { ...row, ...body, totalAmount: total, updatedAt: ts } });
  } catch (e) {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    const row = db.prepare('SELECT business_id FROM purchase_orders WHERE id=?').get(id) as { business_id: string } | undefined;
    if (row?.business_id) {
      await deleteNotionPurchaseOrder(row.business_id).catch(e => console.error('[PO] Notion delete error:', e));
    }

    db.prepare('DELETE FROM purchase_orders WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
