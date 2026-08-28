import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import type { SettlementItem } from '@/lib/settlement-statement';

interface SettlementData {
  title: string;
  issueDate: string;
  exchangeRate: number;
  items: SettlementItem[];
  note: string;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`SELECT * FROM documents WHERE doc_type='rmb_settlement_statement' AND related_type='sale' AND related_id=? ORDER BY updated_at DESC LIMIT 1`).get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ data: null });
  return NextResponse.json({ data: { id: row.id, businessId: row.business_id, ...JSON.parse(row.data_json as string) } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id: saleId } = await params;
  const body = await req.json() as SettlementData;
  const db = getDb();
  const ts = now();

  const existing = db.prepare(`SELECT * FROM documents WHERE doc_type='rmb_settlement_statement' AND related_type='sale' AND related_id=? ORDER BY updated_at DESC LIMIT 1`).get(saleId) as Record<string, unknown> | undefined;
  const issueDate = body.issueDate || ts.slice(0, 10);
  const data: SettlementData = { title: body.title || '정산내역', issueDate, exchangeRate: Number(body.exchangeRate) || 0, items: body.items || [], note: body.note || '' };
  const title = data.title;

  if (existing) {
    const history: unknown[] = JSON.parse((existing.history_json as string) || '[]');
    history.push({ data: JSON.parse(existing.data_json as string), changedAt: ts, changedBy: user.name || user.id });
    db.prepare(`UPDATE documents SET title=?, data_json=?, history_json=?, updated_at=? WHERE id=?`)
      .run(title, JSON.stringify(data), JSON.stringify(history), ts, existing.id);
    return NextResponse.json({ data: { id: existing.id, businessId: existing.business_id, ...data } });
  }

  const id = newId();
  const businessId = `SETL-${issueDate.replace(/-/g, '')}-${id.slice(-6)}`;
  db.prepare(`INSERT INTO documents (id, business_id, doc_type, title, status, data_json, history_json, related_type, related_id, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, businessId, 'rmb_settlement_statement', title, 'active', JSON.stringify(data), '[]', 'sale', saleId, user.id, user.name || '', ts, ts);

  return NextResponse.json({ data: { id, businessId, ...data } }, { status: 201 });
}
