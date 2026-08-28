import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { parseDeposits } from '@/lib/deposits';
import { syncIndexOnWrite } from '@/lib/ai/sync';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/commission-deposits'
  : path.join(process.cwd(), 'data/uploads/commission-deposits');

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; depositId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, depositId } = await params;

  const db = getDb();
  const row = db.prepare('SELECT deposits_json, status FROM commissions WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '커미션을 찾을 수 없습니다.' }, { status: 404 });
  if (row.status === 'closed') return NextResponse.json({ error: '마감된 건은 수정할 수 없습니다. 먼저 마감을 취소하세요.' }, { status: 409 });

  const deposits = parseDeposits(row.deposits_json as string);
  const remaining = deposits.filter(d => d.id !== depositId);
  db.prepare('UPDATE commissions SET deposits_json=? WHERE id=?').run(JSON.stringify(remaining), id);

  try { fs.rmSync(path.join(UPLOAD_BASE, id, depositId), { recursive: true, force: true }); } catch { /* ignore */ }
  syncIndexOnWrite('commission', id);

  return NextResponse.json({ data: { deposits: remaining } });
}
