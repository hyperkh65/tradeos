import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { parseDeposits, summarizeDeposits, type DepositEntry } from '@/lib/deposits';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  if (!body.date || !Number.isFinite(body.amount)) {
    return NextResponse.json({ error: '날짜와 금액은 필수입니다.' }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare('SELECT deposits_json, amount FROM commissions WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '커미션을 찾을 수 없습니다.' }, { status: 404 });

  const deposits = parseDeposits(row.deposits_json as string);
  const entry: DepositEntry = {
    id: newId(), date: body.date, amount: Number(body.amount),
    accountId: body.accountId || undefined, memo: body.memo || undefined, files: [],
  };
  deposits.push(entry);
  db.prepare('UPDATE commissions SET deposits_json=? WHERE id=?').run(JSON.stringify(deposits), id);

  const summary = summarizeDeposits((row.amount as number) || 0, deposits);
  return NextResponse.json({ data: { entry, deposits, ...summary } }, { status: 201 });
}
