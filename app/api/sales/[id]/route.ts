import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const items = body.items || [];
  const rate = Number(body.exchangeRate) || 1;
  const netAmount = items.reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const netKRW = rate === 1 ? netAmount : Math.round(netAmount * rate);
  const vat = Math.round(netKRW * 0.1);
  db.prepare(`UPDATE sales SET customer=?,sale_date=?,sale_type=?,salesperson=?,po_no=?,items_json=?,net_amount=?,vat=?,total_amount=?,exchange_rate=?,misc=? WHERE id=?`)
    .run(body.customer, body.saleDate, body.saleType || '일반', body.salesperson ?? null, body.poNo ?? null, JSON.stringify(items), netAmount, vat, netKRW + vat, rate, body.misc ?? null, id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM sales WHERE id=?').run(id);
  return NextResponse.json({ ok: true });
}
