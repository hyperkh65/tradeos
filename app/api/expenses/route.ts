import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { DEMO_EXPENSES } from '@/lib/demo-data';

function dbToExpense(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id,
    category: row.category, description: row.description,
    amount: row.amount, currency: row.currency,
    exchangeRate: row.exchange_rate || undefined, amountKrw: row.amount_krw || undefined,
    relatedType: row.related_type || undefined, relatedId: row.related_id || undefined, relatedName: row.related_name || undefined,
    paidDate: row.paid_date || undefined, invoiceNo: row.invoice_no || undefined,
    status: row.status, createdBy: row.created_by, createdAt: row.created_at,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM expenses ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToExpense) });

    const seed = db.prepare(`INSERT OR IGNORE INTO expenses (id,business_id,category,description,amount,currency,exchange_rate,amount_krw,related_type,related_id,related_name,paid_date,invoice_no,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const e of DEMO_EXPENSES) {
        seed.run(e.id, e.businessId, e.category, e.description, e.amount, e.currency, e.exchangeRate ?? null, e.amountKrw ?? null, e.relatedType ?? null, e.relatedId ?? null, e.relatedName ?? null, e.paidDate ?? null, null, e.status, e.createdBy, e.createdAt);
      }
    })();
    return NextResponse.json({ data: DEMO_EXPENSES });
  } catch {
    return NextResponse.json({ data: DEMO_EXPENSES });
  }
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

    const amountKrw = body.currency === 'KRW' ? body.amount : (body.amount * (body.exchangeRate || 1380));

    db.prepare(`INSERT INTO expenses (id,business_id,category,description,amount,currency,exchange_rate,amount_krw,related_type,related_id,related_name,paid_date,invoice_no,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, bizId, body.category, body.description, body.amount, body.currency || 'KRW', body.exchangeRate ?? null, amountKrw, body.relatedType ?? null, body.relatedId ?? null, body.relatedName ?? null, body.paidDate ?? null, body.invoiceNo ?? null, body.status || 'pending', 'user-1', ts);

    return NextResponse.json({ data: { id, businessId: bizId, ...body, amountKrw, createdBy: 'user-1', createdAt: ts } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
