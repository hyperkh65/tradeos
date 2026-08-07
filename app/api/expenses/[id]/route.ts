import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM expenses WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const amount = body.amount ?? row.amount;
    const currency = body.currency ?? row.currency;
    const exchangeRate = body.exchangeRate ?? row.exchange_rate;
    const amountKrw = currency === 'KRW' ? amount : (amount * (exchangeRate || 1380));

    db.prepare(`UPDATE expenses SET category=?,description=?,amount=?,currency=?,exchange_rate=?,amount_krw=?,paid_date=?,invoice_no=?,status=? WHERE id=?`)
      .run(body.category ?? row.category, body.description ?? row.description, amount, currency, exchangeRate, amountKrw, body.paidDate ?? row.paid_date, body.invoiceNo ?? row.invoice_no, body.status ?? row.status, id);

    return NextResponse.json({ data: { ...row, ...body, amountKrw, updatedAt: ts } });
  } catch {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM expenses WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
