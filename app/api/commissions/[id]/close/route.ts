import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { updateNotionCommission } from '@/lib/notion/mapper';

async function syncNotionStatus(db: ReturnType<typeof getDb>, row: Record<string, unknown>, status: string) {
  try {
    const notionId = await updateNotionCommission(row.business_id as string, {
      businessId: row.business_id as string, foreignCompany: row.foreign_company as string, date: row.date as string,
      currency: row.currency as string, amount: row.amount as number, exchangeRate: row.exchange_rate as number,
      amountKrw: Math.round(row.amount_krw as number), depositDate: (row.deposit_date as string) || null, status,
      dataJson: JSON.stringify({ memo: row.memo || '' }),
    });
    if (notionId) db.prepare('UPDATE commissions SET notion_id=? WHERE id=?').run(notionId, row.id);
  } catch (e) {
    console.error('[Commission] Notion status sync error:', e);
  }
}

// 전표마감: 커미션 건을 회계전표(복식부기 분개)로 자동 반영한다.
// 차변 보통예금 / 대변 수수료수익, 금액은 원화 환산액.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action === 'reopen' ? 'reopen' : 'close';

  const db = getDb();
  const row = db.prepare('SELECT * FROM commissions WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });

  if (action === 'reopen') {
    if (row.journal_entry_id) {
      db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(row.journal_entry_id);
      db.prepare('DELETE FROM journal_entries WHERE id=?').run(row.journal_entry_id);
    }
    db.prepare(`UPDATE commissions SET status='open', journal_entry_id=NULL, updated_at=? WHERE id=?`).run(now(), id);
    await syncNotionStatus(db, row, 'open');
    return NextResponse.json({ data: { status: 'open' } });
  }

  if (row.status === 'closed') return NextResponse.json({ error: '이미 마감된 건입니다.' }, { status: 409 });
  if (!row.amount_krw || Number(row.amount_krw) <= 0) {
    return NextResponse.json({ error: '환율이 입력되지 않아 원화 환산액이 없습니다. 먼저 환율을 입력한 뒤 마감해주세요.' }, { status: 400 });
  }

  const ts = now();
  const amountKrw = Math.round(row.amount_krw as number);
  const description = `해외 커미션 - ${row.foreign_company}`;

  const existing = db.prepare('SELECT id, entry_no FROM journal_entries WHERE related_ref=?').get(id) as { id: string; entry_no: string } | undefined;
  const entryNo = existing?.entry_no || nextBizId('J');
  const entryId = existing?.id || newId();

  db.transaction(() => {
    if (existing) db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(existing.id);
    if (existing) {
      db.prepare(`UPDATE journal_entries SET entry_date=?, entry_type=?, description=?, status=?, debit_total=?, credit_total=?, doc_no=?, updated_at=? WHERE id=?`)
        .run(row.date, '커미션', description, 'posted', amountKrw, amountKrw, row.business_id, ts, existing.id);
    } else {
      db.prepare(`INSERT INTO journal_entries (id, entry_no, entry_date, entry_type, description, status, created_by, related_ref, doc_no, debit_total, credit_total, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(entryId, entryNo, row.date, '커미션', description, 'posted', user.id, id, row.business_id, amountKrw, amountKrw, ts, ts);
    }
    db.prepare(`INSERT INTO journal_lines (id, entry_id, line_no, account_code, account_name, debit, credit, currency, fx_rate, memo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(newId(), entryId, 1, '1020', '보통예금', amountKrw, 0, 'KRW', 1, description, ts);
    db.prepare(`INSERT INTO journal_lines (id, entry_id, line_no, account_code, account_name, debit, credit, currency, fx_rate, memo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(newId(), entryId, 2, '4060', '수수료수익', 0, amountKrw, row.currency, row.exchange_rate, description, ts);

    db.prepare(`UPDATE commissions SET status='closed', journal_entry_id=?, updated_at=? WHERE id=?`).run(entryId, ts, id);
  })();

  await syncNotionStatus(db, row, 'closed');

  return NextResponse.json({ data: { status: 'closed', journalEntryId: entryId, entryNo } });
}
