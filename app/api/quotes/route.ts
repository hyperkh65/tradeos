import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { DEMO_QUOTES } from '@/lib/demo-data';

function dbToQuote(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, type: row.type,
    companyId: row.company_id || undefined, companyName: row.company_name,
    items: JSON.parse(row.items_json as string || '[]'),
    currency: row.currency, incoterm: row.incoterm || undefined,
    paymentTerms: row.payment_terms || undefined, validity: row.validity || undefined,
    status: row.status, remark: row.remark || undefined,
    createdBy: row.created_by, createdAt: row.created_at,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToQuote) });

    const seed = db.prepare(`INSERT OR IGNORE INTO quotes (id,business_id,type,company_id,company_name,items_json,currency,incoterm,payment_terms,validity,status,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const q of DEMO_QUOTES) {
        seed.run(q.id, q.businessId, q.type, q.companyId ?? null, q.companyName, JSON.stringify(q.items), q.currency, q.incoterm ?? null, q.paymentTerms ?? null, q.validity ?? null, q.status, (q as unknown as Record<string,unknown>).remark ?? null, q.createdBy, q.createdAt);
      }
    })();
    return NextResponse.json({ data: DEMO_QUOTES });
  } catch {
    return NextResponse.json({ data: DEMO_QUOTES });
  }
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

    db.prepare(`INSERT INTO quotes (id,business_id,type,company_id,company_name,items_json,currency,incoterm,payment_terms,validity,status,remark,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, bizId, body.type || 'customer', body.companyId ?? null, body.companyName, JSON.stringify(body.items || []), body.currency || 'KRW', body.incoterm ?? null, body.paymentTerms ?? null, body.validity ?? null, body.status || 'draft', body.remark ?? null, 'user-1', ts);

    return NextResponse.json({ data: { id, businessId: bizId, ...body, createdBy: 'user-1', createdAt: ts } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
