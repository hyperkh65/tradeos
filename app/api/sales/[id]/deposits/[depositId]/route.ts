import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { parseDeposits } from '@/lib/deposits';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/sales-deposits'
  : path.join(process.cwd(), 'data/uploads/sales-deposits');

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; depositId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, depositId } = await params;

  const db = getDb();
  const row = db.prepare('SELECT deposits_json FROM sales WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '매출을 찾을 수 없습니다.' }, { status: 404 });

  const deposits = parseDeposits(row.deposits_json as string);
  const remaining = deposits.filter(d => d.id !== depositId);
  db.prepare('UPDATE sales SET deposits_json=? WHERE id=?').run(JSON.stringify(remaining), id);

  try { fs.rmSync(path.join(UPLOAD_BASE, id, depositId), { recursive: true, force: true }); } catch { /* ignore */ }

  return NextResponse.json({ data: { deposits: remaining } });
}
