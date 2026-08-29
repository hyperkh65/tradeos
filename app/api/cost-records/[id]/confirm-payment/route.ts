import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { dbToCostRecord } from '../../route';

/** 매입원가(purchase_cogs) 처리방향 건의 지급확인 — 한 번의 클릭으로
 * (1) bill_status='collected' + 지급 정보 기록, (2) 회계전표(차변 상품/대변 보통예금)
 * 자동 생성 및 cost_records.journal_entry_id 역참조 저장, (3) 결과적으로 입출금현황
 * (app/api/cashflow/route.ts가 bill_status='collected'인 cost_records를 그대로 읽음)에
 * 자동 반영까지 한 트랜잭션으로 처리한다.
 * commissions/[id]/close/route.ts와 동일한 패턴(related_ref로 전표 중복 방지). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const row = db.prepare('SELECT * FROM cost_records WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });
  if (row.disposition !== 'purchase_cogs') {
    return NextResponse.json({ error: '매입원가 처리방향 건만 지급확인할 수 있습니다.' }, { status: 400 });
  }

  const paidAmountKrw = Math.round(Number(body.paidAmountKrw) || 0);
  if (paidAmountKrw <= 0) return NextResponse.json({ error: '지급액(원화)을 확인해주세요.' }, { status: 400 });
  const settledAt = (body.settledAt as string) || now().slice(0, 10);
  const fxRateAtSettle = body.fxRateAtSettle ?? row.fx_rate_at_cost ?? 1;
  const ts = now();
  const description = `매입원가 - ${(row.description as string) || (row.business_id as string)}${row.po_business_id ? ` (${row.po_business_id})` : ''}`;

  const existing = db.prepare('SELECT id, entry_no FROM journal_entries WHERE related_ref=?').get(id) as { id: string; entry_no: string } | undefined;
  const entryNo = existing?.entry_no || nextBizId('J');
  const entryId = existing?.id || newId();

  db.transaction(() => {
    if (existing) db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(existing.id);
    if (existing) {
      db.prepare(`UPDATE journal_entries SET entry_date=?, entry_type=?, description=?, status=?, debit_total=?, credit_total=?, doc_no=?, updated_at=? WHERE id=?`)
        .run(settledAt, '매입원가', description, 'posted', paidAmountKrw, paidAmountKrw, row.business_id, ts, existing.id);
    } else {
      db.prepare(`INSERT INTO journal_entries (id, entry_no, entry_date, entry_type, description, status, created_by, related_ref, doc_no, debit_total, credit_total, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(entryId, entryNo, settledAt, '매입원가', description, 'posted', user.id, id, row.business_id, paidAmountKrw, paidAmountKrw, ts, ts);
    }
    // 차변: 상품(재고자산 취득) / 대변: 보통예금(원화 즉시 지급 기준)
    db.prepare(`INSERT INTO journal_lines (id, entry_id, line_no, account_code, account_name, debit, credit, currency, fx_rate, memo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(newId(), entryId, 1, '1460', '상품', paidAmountKrw, 0, 'KRW', 1, description, ts);
    db.prepare(`INSERT INTO journal_lines (id, entry_id, line_no, account_code, account_name, debit, credit, currency, fx_rate, memo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(newId(), entryId, 2, '1020', '보통예금', 0, paidAmountKrw, (row.cost_currency as string) || 'KRW', fxRateAtSettle, description, ts);

    db.prepare(`UPDATE cost_records SET
        bill_status='collected', settled_at=?, fx_rate_at_settle=?, paid_amount_krw=?, payment_memo=?, journal_entry_id=?, updated_at=?
      WHERE id=?`)
      .run(settledAt, fxRateAtSettle, paidAmountKrw, (body.paymentMemo as string) ?? row.payment_memo ?? null, entryId, ts, id);
  })();

  const updated = db.prepare('SELECT * FROM cost_records WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: dbToCostRecord(updated), journalEntryId: entryId, entryNo });
}
