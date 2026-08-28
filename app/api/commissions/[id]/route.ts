import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { updateNotionCommission, deleteNotionCommission } from '@/lib/notion/mapper';
import { dbToCommission } from '../route';
import { syncIndexOnWrite, syncIndexOnDelete } from '@/lib/ai/sync';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const row = getDb().prepare('SELECT * FROM commissions WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json({ data: dbToCommission(row) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM commissions WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });
  if (row.status === 'closed') return NextResponse.json({ error: '마감된 건은 수정할 수 없습니다. 먼저 마감을 취소하세요.' }, { status: 409 });

  const body = await req.json();
  const ts = now();
  const foreignCompany = body.foreignCompany ?? row.foreign_company;
  const date = body.date ?? row.date;
  const currency = body.currency ?? row.currency;
  const amount = body.amount ?? row.amount;
  const exchangeRate = currency === 'KRW' ? 1 : (body.exchangeRate ?? row.exchange_rate);
  const amountKrw = Math.round(Number(amount) * Number(exchangeRate));

  db.prepare(`UPDATE commissions SET foreign_company=?, date=?, currency=?, amount=?, exchange_rate=?, amount_krw=?, account_id=?, memo=?, updated_at=? WHERE id=?`)
    .run(foreignCompany, date, currency, amount, exchangeRate, amountKrw,
      body.accountId ?? row.account_id, body.memo ?? row.memo, ts, id);

  try {
    const notionId = await updateNotionCommission(row.business_id as string, {
      businessId: row.business_id as string, foreignCompany, date, currency, amount: Number(amount),
      exchangeRate: Number(exchangeRate), amountKrw, depositDate: null,
      status: row.status as string, dataJson: JSON.stringify({ memo: body.memo ?? row.memo ?? '' }),
    });
    if (notionId) db.prepare('UPDATE commissions SET notion_id=? WHERE id=?').run(notionId, id);
  } catch (e) {
    console.error('[Commission] Notion update error:', e);
  }

  const updated = db.prepare('SELECT * FROM commissions WHERE id=?').get(id) as Record<string, unknown>;
  syncIndexOnWrite('commission', id);
  return NextResponse.json({ data: dbToCommission(updated) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM commissions WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });
  if (row.status === 'closed') return NextResponse.json({ error: '마감된 건은 삭제할 수 없습니다. 먼저 마감을 취소하세요.' }, { status: 409 });

  db.prepare('DELETE FROM commissions WHERE id=?').run(id);
  deleteNotionCommission(row.business_id as string).catch(() => {});
  syncIndexOnDelete('commission', id);
  return NextResponse.json({ success: true });
}
