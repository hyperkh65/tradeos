import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE inventory SET product_name=?,product_code=?,qty=?,location=?,purchase_price=?,currency=?,memo=?,updated_at=? WHERE id=?`)
    .run(
      body.productName, body.productCode || '', body.qty ?? 0,
      body.location || '본사 창고',
      body.purchasePrice ?? null, body.currency || 'USD',
      body.memo ?? null, ts, id
    );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM inventory WHERE id=?').run(id);
  return NextResponse.json({ ok: true });
}
