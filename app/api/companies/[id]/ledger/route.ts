import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

interface LedgerEntry {
  saleId: string;
  saleBusinessId: string;
  date: string;
  productName: string;
  specification: string;
  qty: number;
  unitPrice: number;
  amount: number;
  currency: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const company = db.prepare('SELECT * FROM companies WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!company) return NextResponse.json({ error: '거래처를 찾을 수 없습니다.' }, { status: 404 });

  const url = new URL(req.url);
  const start = url.searchParams.get('start') || '1970-01-01';
  const end = url.searchParams.get('end') || '9999-12-31';

  const rows = db.prepare(`SELECT * FROM sales WHERE customer=? AND sale_date>=? AND sale_date<=? ORDER BY sale_date ASC, created_at ASC`)
    .all(company.name as string, start, end) as Record<string, unknown>[];

  const entries: LedgerEntry[] = [];
  for (const row of rows) {
    let items: Array<{ product?: string; specification?: string; qty?: number; unitPrice?: number; amount?: number }> = [];
    try { items = JSON.parse((row.items_json as string) || '[]'); } catch { /* ignore */ }
    for (const it of items) {
      entries.push({
        saleId: row.id as string,
        saleBusinessId: row.business_id as string,
        date: row.sale_date as string,
        productName: it.product || '',
        specification: it.specification || '',
        qty: it.qty || 0,
        unitPrice: it.unitPrice || 0,
        amount: it.amount || (it.qty || 0) * (it.unitPrice || 0),
        currency: (row.currency as string) || 'KRW',
      });
    }
  }

  return NextResponse.json({ data: { company: { id: company.id, name: company.name }, entries } });
}
