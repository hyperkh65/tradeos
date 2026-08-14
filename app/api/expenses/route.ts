import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionExpenses, createNotionExpense } from '@/lib/notion/mapper';
import type { Expense } from '@/types';

function dbToExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    category: row.category as string,
    description: row.description as string,
    amount: row.amount as number,
    currency: (row.currency as string) || 'KRW',
    exchangeRate: (row.exchange_rate as number) || undefined,
    amountKrw: (row.amount_krw as number) || undefined,
    relatedType: (row.related_type as Expense['relatedType']) || undefined,
    relatedId: (row.related_id as string) || undefined,
    relatedName: (row.related_name as string) || undefined,
    paidDate: (row.paid_date as string) || undefined,
    invoiceNo: (row.invoice_no as string) || undefined,
    status: (row.status as Expense['status']) || 'pending',
    createdBy: (row.created_by as string) || 'user-1',
    createdAt: row.created_at as string,
  };
}

function syncExpenseToDb(db: ReturnType<typeof getDb>, e: Expense, ts: string, fromNotion = false) {
  if (fromNotion) {
    const existing = db.prepare('SELECT id FROM expenses WHERE id=? OR business_id=?').get(e.id, e.businessId);
    if (existing) return;
  }
  const amountKrw = e.currency === 'KRW' ? e.amount : (e.amount * (e.exchangeRate || 1380));
  db.prepare(`INSERT OR IGNORE INTO expenses
    (id,business_id,category,description,amount,currency,exchange_rate,amount_krw,related_type,related_id,related_name,paid_date,invoice_no,status,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(e.id, e.businessId, e.category, e.description, e.amount, e.currency,
      e.exchangeRate ?? null, amountKrw, e.relatedType ?? null, e.relatedId ?? null,
      e.relatedName ?? null, e.paidDate ?? null, e.invoiceNo ?? null,
      e.status, e.createdBy || 'ynk-erp', e.createdAt || ts);
}

export async function GET() {
  const db = getDb();
  const ts = now();

  try {
    const notionExpenses = await fetchNotionExpenses();
    if (notionExpenses.length > 0) {
      db.transaction(() => {
        for (const e of notionExpenses) syncExpenseToDb(db, e, ts, true);
      })();
      return NextResponse.json({ data: notionExpenses });
    }
  } catch (e) {
    console.error('[Expenses] Notion fetch error:', e);
  }

  const rows = db.prepare('SELECT * FROM expenses ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToExpense) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM expenses WHERE business_id LIKE 'EXP-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g, '') || '0') : 0;
    const year = new Date().getFullYear();
    const bizId = body.businessId || `EXP-${year}-${String(lastNum + 1).padStart(4, '0')}`;

    const expense: Expense = {
      id, businessId: bizId,
      category: body.category || '기타',
      description: body.description || '',
      amount: body.amount || 0,
      currency: body.currency || 'KRW',
      exchangeRate: body.exchangeRate,
      relatedType: body.relatedType,
      relatedId: body.relatedId,
      relatedName: body.relatedName,
      paidDate: body.paidDate,
      invoiceNo: body.invoiceNo,
      status: body.status || 'pending',
      createdBy: 'user-1',
      createdAt: ts,
    };

    // Save to Notion (ERP)
    await createNotionExpense(expense).catch(() => null);

    syncExpenseToDb(db, expense, ts);
    return NextResponse.json({ data: expense }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
