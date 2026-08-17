import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { dbToFI } from '../route';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM foreign_invoices WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });
  return NextResponse.json({ data: dbToFI(row) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();

    const items = body.items;
    const subtotal = items ? items.reduce((s: number, i: { amount: number }) => s + (i.amount || 0), 0) : undefined;

    db.prepare(`UPDATE foreign_invoices SET
      client_id=COALESCE(?,client_id), client_name=COALESCE(?,client_name),
      currency=COALESCE(?,currency), subtotal=COALESCE(?,subtotal), total=COALESCE(?,total),
      items_json=COALESCE(?,items_json),
      issued_date=COALESCE(?,issued_date), due_date=COALESCE(?,due_date),
      status=COALESCE(?,status),
      fx_rate_at_payment=COALESCE(?,fx_rate_at_payment),
      paid_amount_krw=COALESCE(?,paid_amount_krw),
      paid_at=COALESCE(?,paid_at),
      remark=COALESCE(?,remark), updated_at=?
      WHERE id=?`)
      .run(
        body.clientId ?? null, body.clientName ?? null,
        body.currency ?? null, subtotal ?? null, subtotal ?? null,
        items ? JSON.stringify(items) : null,
        body.issuedDate ?? null, body.dueDate ?? null,
        body.status ?? null,
        body.fxRateAtPayment ?? null,
        body.paidAmountKrw ?? null,
        body.paidAt ?? null,
        body.remark ?? null,
        ts, id,
      );

    // 수금 완료 시 연결 cost_records 상태 업데이트
    if (body.status === 'paid') {
      db.prepare("UPDATE cost_records SET bill_status='collected', fx_rate_at_settle=?, settled_at=?, updated_at=? WHERE linked_invoice_id=?")
        .run(body.fxRateAtPayment ?? null, body.paidAt ?? ts.slice(0, 10), ts, id);
    }

    const updated = db.prepare('SELECT * FROM foreign_invoices WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToFI(updated) });
  } catch (e) {
    console.error('[foreign-invoices PUT]', e);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}
