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
  const commissions = db.prepare(`SELECT business_id, foreign_company, deposits_json FROM commissions WHERE deposits_json IS NOT NULL AND deposits_json != '[]'`).all() as Record<string, unknown>[];
  for (const c of commissions) {
    for (const d of parseDeposits(c.deposits_json as string)) {
      if (d.date < start || d.date > end) continue;
      entries.push({ date: d.date, type: 'in', source: 'commission', refBusinessId: c.business_id as string, refName: c.foreign_company as string, amount: d.amount, accountId: d.accountId });
    }
  }

  // 지출 — 비용원장 중 실제 지급 완료(정산)된 건
  const costs = db.prepare(`SELECT business_id, description, cost_type, client_name, cost_amount, cost_amount_krw, settled_at FROM cost_records WHERE settled_at IS NOT NULL AND settled_at != ''`).all() as Record<string, unknown>[];
  for (const c of costs) {
    const date = c.settled_at as string;
    if (date < start || date > end) continue;
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
