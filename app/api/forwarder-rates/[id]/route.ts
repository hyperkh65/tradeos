import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { dbToRate } from '../route';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM forwarder_rates WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });

  const body = await req.json();
  const ts = now();
  const quoteDate = body.quoteDate ?? row.quote_date;
  const quoteMonth = body.quoteMonth || (body.quoteDate ? String(body.quoteDate).slice(0, 7) : row.quote_month);
  db.prepare(`UPDATE forwarder_rates SET
    forwarder_id=?, forwarder_name=?, pol=?, pod=?, container_type=?, carrier=?, rate_type=?,
    total_amount=?, total_currency=?, breakdown_json=?, quote_date=?, quote_month=?, valid_until=?, doc_no=?,
    contact_person=?, memo=?, updated_at=? WHERE id=?`).run(
    body.forwarderId ?? row.forwarder_id, body.forwarderName ?? row.forwarder_name,
    (body.pol ?? row.pol as string).toUpperCase(), (body.pod ?? row.pod as string).toUpperCase(),
    body.containerType ?? row.container_type, body.carrier ?? row.carrier, body.rateType ?? row.rate_type,
    body.totalAmount ?? row.total_amount, body.totalCurrency ?? row.total_currency,
    body.breakdown ? JSON.stringify(body.breakdown) : row.breakdown_json,
    quoteDate, quoteMonth, body.validUntil ?? row.valid_until, body.docNo ?? row.doc_no,
    body.contactPerson ?? row.contact_person, body.memo ?? row.memo, ts, id,
  );

  const updated = db.prepare('SELECT * FROM forwarder_rates WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: dbToRate(updated) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT id FROM forwarder_rates WHERE id=?').get(id);
  if (!row) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });
  db.prepare('DELETE FROM forwarder_rates WHERE id=?').run(id);
  return NextResponse.json({ success: true });
}
