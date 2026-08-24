import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

function dbToAccount(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, currency: row.currency,
    bankName: row.bank_name, accountNumber: row.account_number,
    holderName: row.holder_name || undefined, memo: row.memo || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM bank_accounts ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToAccount) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json();
  if (!body.bankName || !body.accountNumber) return NextResponse.json({ error: '은행명과 계좌번호는 필수입니다.' }, { status: 400 });

  const db = getDb();
  const id = newId();
  const ts = now();
  const businessId = nextBizId('ACC', false);
  db.prepare(`INSERT INTO bank_accounts (id, business_id, currency, bank_name, account_number, holder_name, memo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, businessId, body.currency || 'KRW', body.bankName, body.accountNumber, body.holderName || null, body.memo || null, ts, ts);

  return NextResponse.json({ data: dbToAccount({ id, business_id: businessId, currency: body.currency || 'KRW', bank_name: body.bankName, account_number: body.accountNumber, holder_name: body.holderName, memo: body.memo, created_at: ts, updated_at: ts }) }, { status: 201 });
}
