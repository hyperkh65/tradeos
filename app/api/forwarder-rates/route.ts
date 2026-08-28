import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export function dbToRate(row: Record<string, unknown>) {
  return {
    id: row.id, forwarderId: row.forwarder_id || undefined, forwarderName: row.forwarder_name,
    pol: row.pol, pod: row.pod, containerType: row.container_type,
    carrier: row.carrier || undefined, rateType: row.rate_type || undefined,
    totalAmount: row.total_amount, totalCurrency: row.total_currency,
    breakdown: JSON.parse((row.breakdown_json as string) || '[]'),
    quoteDate: row.quote_date || undefined, quoteMonth: row.quote_month || undefined, validUntil: row.valid_until || undefined,
    docNo: row.doc_no || undefined, contactPerson: row.contact_person || undefined,
    sourceFileUrl: row.source_file_url || undefined, memo: row.memo || undefined,
    createdByName: row.created_by_name || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const url = new URL(req.url);
  const pol = url.searchParams.get('pol');
  const pod = url.searchParams.get('pod');
  const forwarderId = url.searchParams.get('forwarderId');

  const conds: string[] = [];
  const values: unknown[] = [];
  if (pol) { conds.push('pol=?'); values.push(pol); }
  if (pod) { conds.push('pod=?'); values.push(pod); }
  if (forwarderId) { conds.push('forwarder_id=?'); values.push(forwarderId); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const db = getDb();
  const rows = db.prepare(`SELECT * FROM forwarder_rates ${where} ORDER BY quote_date DESC, created_at DESC`).all(...values) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToRate) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json();
  if (!body.forwarderName?.trim() || !body.pol?.trim() || !body.pod?.trim() || !body.containerType || !Number.isFinite(body.totalAmount)) {
    return NextResponse.json({ error: '포워더명, 출발항, 도착항, 컨테이너타입, 총운임은 필수입니다.' }, { status: 400 });
  }

  const db = getDb();
  const id = newId();
  const ts = now();
  const quoteDate = body.quoteDate || null;
  const quoteMonth = body.quoteMonth || (quoteDate ? String(quoteDate).slice(0, 7) : ts.slice(0, 7));
  db.prepare(`INSERT INTO forwarder_rates
    (id, forwarder_id, forwarder_name, pol, pod, container_type, carrier, rate_type,
     total_amount, total_currency, breakdown_json, quote_date, quote_month, valid_until, doc_no,
     contact_person, source_file_url, memo, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, body.forwarderId || null, body.forwarderName.trim(),
    body.pol.trim().toUpperCase(), body.pod.trim().toUpperCase(), body.containerType,
    body.carrier || null, body.rateType || null,
    body.totalAmount, body.totalCurrency || 'USD', JSON.stringify(body.breakdown || []),
    quoteDate, quoteMonth, body.validUntil || null, body.docNo || null,
    body.contactPerson || null, body.sourceFileUrl || null, body.memo || null,
    user.id, user.name, ts, ts,
  );

  const row = db.prepare('SELECT * FROM forwarder_rates WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: dbToRate(row) }, { status: 201 });
}
