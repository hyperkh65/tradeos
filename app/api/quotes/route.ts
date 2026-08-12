import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionQuotes, createNotionQuote } from '@/lib/notion/mapper';
import type { Quote } from '@/types';

export function dbToQuote(row: Record<string, unknown>): Quote & Record<string, unknown> {
  const items = JSON.parse((row.items_json as string) || '[]').map((it: any) => ({
    ...it,
    amount: it.amount ?? (it.quantity ?? it.qty ?? 0) * (it.unitPrice ?? 0),
  }));
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    type: (row.type as Quote['type']) || 'customer',
    companyId: (row.company_id as string) || '',
    companyName: (row.company_name as string) || '',
    items,
    currency: (row.currency as string) || 'KRW',
    incoterm: (row.incoterm as string) || undefined,
    paymentTerms: (row.payment_terms as string) || undefined,
    validity: (row.validity as string) || undefined,
    status: (row.status as Quote['status']) || 'draft',
    remark: (row.remark as string) || undefined,
    createdBy: (row.created_by as string) || 'user-1',
    createdAt: row.created_at as string,
    quoteDate: (row.quote_date as string) || (row.created_at as string)?.slice(0, 10),
    totalAmount: (row.total_amount as number) || items.reduce((s: number, i: any) => s + (i.amount || 0), 0),
    updatedAt: (row.updated_at as string) || undefined,
    updatedBy: (row.updated_by as string) || undefined,
    createdByName: (row.created_by_name as string) || undefined,
    imagesJson: (row.images_json as string) || undefined,
    historyJson: (row.history_json as string) || '[]',
    docType: (row.doc_type as string) || 'QUOTE',
    specialNotes: (row.special_notes as string) || undefined,
    generalInfo: (row.general_info as string) || undefined,
  };
}

const UPSERT = `INSERT OR REPLACE INTO quotes
  (id,business_id,type,company_id,company_name,items_json,currency,incoterm,payment_terms,
   validity,status,remark,created_by,created_by_name,notion_id,created_at,
   quote_date,total_amount,images_json,history_json,doc_type,special_notes,general_info)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all() as Record<string, unknown>[];

  try {
    const notionQuotes = await fetchNotionQuotes();
    if (notionQuotes.length > 0) {
      const upsert = db.prepare(UPSERT);
      db.transaction(() => {
        for (const q of notionQuotes) {
          const existing = db.prepare('SELECT updated_at, created_at FROM quotes WHERE id=?').get(q.id) as { updated_at: string; created_at: string } | undefined;
          if (existing) continue; // keep local if exists
          const totalAmount = q.items.reduce((s, it) => s + ((it as any).amount || it.unitPrice * ((it as any).quantity || (it as any).qty || 0)), 0);
          upsert.run(
            q.id, q.businessId, q.type || 'customer', q.companyId ?? null, q.companyName,
            JSON.stringify(q.items), q.currency, q.incoterm ?? null, q.paymentTerms ?? null,
            q.validity ?? null, q.status || 'sent', q.remark ?? null,
            q.createdBy || 'ynk-erp', null, q.id,
            q.createdAt, q.createdAt?.slice(0, 10), totalAmount, null, '[]',
            'QUOTE', null, null,
          );
        }
      })();
    }
  } catch (e) {
    console.error('[Quote] Notion fetch error:', e);
  }

  const updated = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const data = updated.length > 0 ? updated : rows;
  return NextResponse.json({ data: data.map(dbToQuote) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const year = new Date().getFullYear();
    const allQtRows = db.prepare(`SELECT business_id FROM quotes WHERE business_id LIKE 'QT-${year}-%'`).all() as { business_id: string }[];
    const maxNum = allQtRows.reduce((max, r) => {
      const parts = r.business_id.split('-');
      const n = parseInt(parts[parts.length - 1]) || 0;
      return (n > 0 && n < 100000) ? Math.max(max, n) : max;
    }, 0);
    const bizId = body.businessId || `QT-${year}-${String(maxNum + 1).padStart(4, '0')}`;

    const items = (body.items || []).map((it: any) => ({
      ...it,
      amount: it.amount ?? it.quantity * it.unitPrice,
    }));
    const totalAmount = items.reduce((s: number, it: any) => s + (it.amount || 0), 0);
    const quoteDate = body.quoteDate || ts.slice(0, 10);
    const historyEntry = { at: ts, by: body.createdByName || 'user-1', action: '생성' };

    const q: Quote = {
      id, businessId: bizId,
      type: body.type || 'customer',
      companyId: body.companyId || '',
      companyName: body.companyName || '',
      items,
      currency: body.currency || 'KRW',
      incoterm: body.incoterm,
      paymentTerms: body.paymentTerms,
      validity: body.validity,
      status: body.status || 'draft',
      remark: body.remark,
      createdBy: 'user-1',
      createdAt: ts,
    };

    const notionId = await createNotionQuote(q).catch(() => null);

    db.prepare(UPSERT).run(
      id, bizId, body.type || 'customer', body.companyId ?? null, body.companyName,
      JSON.stringify(items), body.currency || 'KRW', body.incoterm ?? null, body.paymentTerms ?? null,
      body.validity ?? null, body.status || 'draft', body.remark ?? null,
      'user-1', body.createdByName ?? null, notionId ?? null, ts,
      quoteDate, totalAmount, body.imagesJson ?? null, JSON.stringify([historyEntry]),
      body.docType ?? 'QUOTE', body.specialNotes ?? null, body.generalInfo ?? null,
    );

    return NextResponse.json({ data: { ...dbToQuote({ ...q as any, id, business_id: bizId, created_at: ts, quote_date: quoteDate, total_amount: totalAmount, history_json: JSON.stringify([historyEntry]) }) } }, { status: 201 });
  } catch (e) {
    console.error('[Quote] POST error:', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
