import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionQuotes, createNotionQuote } from '@/lib/notion/mapper';
import type { Quote } from '@/types';

function dbToQuote(row: Record<string, unknown>): Quote {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    type: (row.type as Quote['type']) || 'customer',
    companyId: (row.company_id as string) || '',
    companyName: (row.company_name as string) || '',
    items: JSON.parse(row.items_json as string || '[]'),
    currency: (row.currency as string) || 'KRW',
    incoterm: (row.incoterm as string) || undefined,
    paymentTerms: (row.payment_terms as string) || undefined,
    validity: (row.validity as string) || undefined,
    status: (row.status as Quote['status']) || 'draft',
    remark: (row.remark as string) || undefined,
    createdBy: (row.created_by as string) || 'user-1',
    createdAt: row.created_at as string,
  };
}

function quoteToDb(db: ReturnType<typeof getDb>, q: Quote, id: string, ts: string, notionId?: string | null) {
  db.prepare(`INSERT OR REPLACE INTO quotes
    (id,business_id,type,company_id,company_name,items_json,currency,incoterm,payment_terms,validity,status,remark,created_by,notion_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, q.businessId, q.type || 'customer', q.companyId ?? null, q.companyName,
      JSON.stringify(q.items), q.currency, q.incoterm ?? null, q.paymentTerms ?? null,
      q.validity ?? null, q.status || 'sent', q.remark ?? null,
      q.createdBy || 'ynk-erp', notionId ?? null, q.createdAt || ts);
}

export async function GET() {
  const db = getDb();
  const ts = now();

  try {
    // Try Notion (ERP) first
    const notionQuotes = await fetchNotionQuotes();
    if (notionQuotes.length > 0) {
      db.transaction(() => {
        for (const q of notionQuotes) {
          quoteToDb(db, q, q.id, ts, q.id);
        }
      })();
      return NextResponse.json({ data: notionQuotes });
    }
  } catch (e) {
    console.error('[Quote] Notion fetch error:', e);
  }

  // Fall back to SQLite
  const rows = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToQuote) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM quotes WHERE business_id LIKE 'QT-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g, '') || '0') : 0;
    const year = new Date().getFullYear();
    const bizId = body.businessId || `QT-${year}-${String(lastNum + 1).padStart(4, '0')}`;

    const q: Quote = {
      id, businessId: bizId,
      type: body.type || 'customer',
      companyId: body.companyId || '',
      companyName: body.companyName || '',
      items: body.items || [],
      currency: body.currency || 'KRW',
      incoterm: body.incoterm,
      paymentTerms: body.paymentTerms,
      validity: body.validity,
      status: body.status || 'draft',
      remark: body.remark,
      createdBy: 'user-1',
      createdAt: ts,
    };

    // Save to Notion (ERP)
    const notionId = await createNotionQuote(q).catch(() => null);

    // Save to SQLite
    quoteToDb(db, q, id, ts, notionId);

    return NextResponse.json({ data: q }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
