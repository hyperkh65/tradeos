import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM po_qty_adjustments ORDER BY updated_at DESC`).all();
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 잔여수량 기준시점을 조정할 수 있습니다.' }, { status: 403 });

  const body = await req.json();
  const { poId, poBusinessId, itemId, productName, cutoverDate, remainingQty, note } = body;
  if (!poId || !itemId || !cutoverDate || remainingQty == null) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
  }

  const db = getDb();
  const ts = now();
  const existing = db.prepare(`SELECT * FROM po_qty_adjustments WHERE po_id=? AND item_id=?`).get(poId, itemId) as Record<string, unknown> | undefined;

  if (existing) {
    const history: any[] = JSON.parse((existing.history_json as string) || '[]');
    history.push({
      cutoverDate: existing.cutover_date, remainingQty: existing.remaining_qty, note: existing.note,
      changedAt: ts, changedBy: user.name || user.id,
    });
    db.prepare(`UPDATE po_qty_adjustments SET cutover_date=?, remaining_qty=?, note=?, history_json=?, updated_at=? WHERE id=?`)
      .run(cutoverDate, remainingQty, note ?? null, JSON.stringify(history), ts, existing.id);
    return NextResponse.json({ data: { ...existing, cutover_date: cutoverDate, remaining_qty: remainingQty, note, updated_at: ts } });
  }

  const id = newId();
  db.prepare(`INSERT INTO po_qty_adjustments
    (id, po_id, po_business_id, item_id, product_name, cutover_date, remaining_qty, note, history_json, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, poId, poBusinessId || '', itemId, productName || '', cutoverDate, remainingQty, note ?? null, '[]', user.id, user.name || '', ts, ts);
  return NextResponse.json({ data: { id, poId, itemId, cutoverDate, remainingQty, note } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 삭제할 수 있습니다.' }, { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

  const db = getDb();
  db.prepare(`DELETE FROM po_qty_adjustments WHERE id=?`).run(id);
  return NextResponse.json({ success: true });
}
