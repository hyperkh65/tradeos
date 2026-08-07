import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();

    const row = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(id);
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const items = body.items || JSON.parse((row as Record<string,string>).items_json || '[]');
    const total = items.reduce((s: number, i: { amount: number }) => s + (i.amount || 0), 0);

    db.prepare(`UPDATE purchase_orders SET supplier_name=?,items_json=?,currency=?,total_amount=?,deposit_amount=?,balance_amount=?,payment_terms=?,order_date=?,production_due_date=?,inspection_date=?,etd=?,status=?,incoterm=?,remark=?,updated_at=? WHERE id=?`)
      .run(body.supplierName||(row as Record<string,unknown>).supplier_name, JSON.stringify(items), body.currency||(row as Record<string,unknown>).currency, total, body.depositAmount??null, body.balanceAmount??null, body.paymentTerms??null, body.orderDate||(row as Record<string,unknown>).order_date, body.productionDueDate??null, body.inspectionDate??null, body.etd??null, body.status||(row as Record<string,unknown>).status, body.incoterm??null, body.remark??null, ts, id);

    return NextResponse.json({ data: { ...(row as object), ...body, totalAmount: total, updatedAt: ts } });
  } catch (e) {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM purchase_orders WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
