import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { createNotionCommission } from '@/lib/notion/mapper';
import { parseDeposits, summarizeDeposits } from '@/lib/deposits';
import { syncIndexOnWrite } from '@/lib/ai/sync';

export function dbToCommission(row: Record<string, unknown>) {
  const deposits = parseDeposits(row.deposits_json as string);
  const { totalDeposited, remaining, status: depositStatus } = summarizeDeposits((row.amount as number) || 0, deposits);
  return {
    id: row.id, businessId: row.business_id, foreignCompany: row.foreign_company,
    date: row.date, currency: row.currency, amount: row.amount, exchangeRate: row.exchange_rate,
    amountKrw: row.amount_krw, accountId: row.account_id || undefined,
    invoiceFiles: JSON.parse((row.invoice_files_json as string) || '[]'),
    deposits, totalDeposited, depositRemaining: remaining, depositStatus,
    memo: row.memo || undefined, status: row.status,
    journalEntryId: row.journal_entry_id || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM commissions ORDER BY date DESC, created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToCommission) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json();
  if (!body.foreignCompany || !body.date || !body.amount) {
    return NextResponse.json({ error: '해외업체명, 일자, 금액은 필수입니다.' }, { status: 400 });
  }

  const db = getDb();
  const id = newId();
  const ts = now();
  const businessId = nextBizId('COM');
  const currency = body.currency || 'USD';
  const exchangeRate = currency === 'KRW' ? 1 : (Number(body.exchangeRate) || 0);
  const amountKrw = Math.round(Number(body.amount) * exchangeRate);

  db.prepare(`INSERT INTO commissions
    (id, business_id, foreign_company, date, currency, amount, exchange_rate, amount_krw, account_id, deposit_date, invoice_files_json, deposit_files_json, memo, status, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, businessId, body.foreignCompany, body.date, currency, body.amount, exchangeRate, amountKrw,
      body.accountId || null, body.depositDate || null, '[]', '[]', body.memo || null, 'open',
      user.id, user.name || '', ts, ts);

  // 생성 직후 바로 마감(전표 자동 반영)될 수 있어, 노션 동기화가 뒤늦게 끝나며
  // notion_id가 새/오래된 값끼리 뒤섞이지 않도록 완료를 기다린 뒤 응답한다.
  try {
    const notionId = await createNotionCommission({
      businessId, foreignCompany: body.foreignCompany, date: body.date, currency, amount: Number(body.amount),
      exchangeRate, amountKrw, depositDate: body.depositDate || null, status: 'open',
      dataJson: JSON.stringify({ memo: body.memo || '' }),
    });
    if (notionId) db.prepare('UPDATE commissions SET notion_id=? WHERE id=?').run(notionId, id);
  } catch (e) {
    console.error('[Commission] Notion create error:', e);
  }

  const row = db.prepare('SELECT * FROM commissions WHERE id=?').get(id) as Record<string, unknown>;
  syncIndexOnWrite('commission', id);
  return NextResponse.json({ data: dbToCommission(row) }, { status: 201 });
}
