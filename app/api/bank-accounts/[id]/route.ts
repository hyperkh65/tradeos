import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const row = db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '계좌를 찾을 수 없습니다.' }, { status: 404 });

  db.prepare(`UPDATE bank_accounts SET currency=?, bank_name=?, account_number=?, holder_name=?, memo=?, updated_at=? WHERE id=?`)
    .run(body.currency ?? row.currency, body.bankName ?? row.bank_name, body.accountNumber ?? row.account_number, body.holderName ?? row.holder_name, body.memo ?? row.memo, now(), id);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const inUse = db.prepare('SELECT COUNT(*) as c FROM commissions WHERE account_id=?').get(id) as { c: number };
  if (inUse.c > 0) return NextResponse.json({ error: '이 계좌를 사용 중인 커미션 기록이 있어 삭제할 수 없습니다.' }, { status: 409 });
  db.prepare('DELETE FROM bank_accounts WHERE id=?').run(id);
  return NextResponse.json({ success: true });
}
