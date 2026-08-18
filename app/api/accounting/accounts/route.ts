import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM chart_of_accounts WHERE is_active=1 ORDER BY code').all();
  return NextResponse.json({ data: rows });
}
