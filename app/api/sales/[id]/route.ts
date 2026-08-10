import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const items = body.items || [];
  const netAmount = items.reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const vat = Math.round(netAmount * 0.1);
  db.prepare(`UPDATE sales SET customer=?,sale_date=?,sale_type=?,salesperson=?,po_no=?,items_json=?,net_amount=?,vat=?,total_amount=? WHERE id=?`)
    .run(body.customer, body.saleDate, body.saleType || '일반', body.salesperson ?? null, body.poNo ?? null, JSON.stringify(items), netAmount, vat, netAmount + vat, id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM sales WHERE id=?').run(id);
  return NextResponse.json({ ok: true });
}
