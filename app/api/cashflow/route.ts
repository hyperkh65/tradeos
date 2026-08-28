import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { parseDeposits } from '@/lib/deposits';

export interface CashflowEntry {
  date: string;
  type: 'in' | 'out';
  source: 'sale' | 'commission' | 'cost';
  refBusinessId: string;
  refName: string;
  amount: number;
  accountId?: string;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const url = new URL(req.url);
  const start = url.searchParams.get('start') || '1970-01-01';
  const end = url.searchParams.get('end') || '9999-12-31';

  const db = getDb();
  const entries: CashflowEntry[] = [];

  // 수입 — 매출 입금
  const sales = db.prepare(`SELECT business_id, customer, deposits_json FROM sales WHERE deposits_json IS NOT NULL AND deposits_json != '[]'`).all() as Record<string, unknown>[];
  for (const s of sales) {
    for (const d of parseDeposits(s.deposits_json as string)) {
      if (d.date < start || d.date > end) continue;
      entries.push({ date: d.date, type: 'in', source: 'sale', refBusinessId: s.business_id as string, refName: s.customer as string, amount: d.amount, accountId: d.accountId });
    }
  }

  // 수입 — 커미션 입금
  // 커미션 입금액은 원화가 아니라 그 커미션의 원래 통화(주로 USD)로 입력·저장된다
  // (커미션 모달의 DepositManager에 totalDue={form.amount}, 즉 외화 원본 금액이 넘어가기
  // 때문). 그래서 원화 집계인 이 화면에서는 반드시 exchange_rate를 곱해 환산해야 하고,
  // 곱하지 않으면 "총 입금"이 외화 숫자를 원화인 것처럼 그대로 더해 터무니없이 작게 나온다.
  const commissions = db.prepare(`SELECT business_id, foreign_company, exchange_rate, deposits_json FROM commissions WHERE deposits_json IS NOT NULL AND deposits_json != '[]'`).all() as Record<string, unknown>[];
  for (const c of commissions) {
    const rate = (c.exchange_rate as number) || 1;
    for (const d of parseDeposits(c.deposits_json as string)) {
      if (d.date < start || d.date > end) continue;
      entries.push({ date: d.date, type: 'in', source: 'commission', refBusinessId: c.business_id as string, refName: c.foreign_company as string, amount: Math.round(d.amount * rate), accountId: d.accountId });
    }
  }

  // 지출 — 비용원장 중 실제 지급/수금 완료된 건 (자동 판관비 처리 등 settled_at 미기록 건도 incurred_date로 포함)
  const costs = db.prepare(`SELECT business_id, description, cost_type, client_name, cost_amount, cost_amount_krw, settled_at, incurred_date FROM cost_records WHERE bill_status='collected'`).all() as Record<string, unknown>[];
  for (const c of costs) {
    const date = (c.settled_at as string) || (c.incurred_date as string);
    if (!date || date < start || date > end) continue;
    entries.push({
      date, type: 'out', source: 'cost', refBusinessId: c.business_id as string,
      refName: (c.description as string) || (c.client_name as string) || (c.cost_type as string) || '비용',
      amount: (c.cost_amount_krw as number) || (c.cost_amount as number) || 0,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  let balance = 0;
  const withBalance = entries.map(e => {
    balance += e.type === 'in' ? e.amount : -e.amount;
    return { ...e, balance };
  });

  const totalIn = entries.filter(e => e.type === 'in').reduce((s, e) => s + e.amount, 0);
  const totalOut = entries.filter(e => e.type === 'out').reduce((s, e) => s + e.amount, 0);

  return NextResponse.json({ data: withBalance.reverse(), totalIn, totalOut, net: totalIn - totalOut });
}
