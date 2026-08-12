import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionCompanies, createNotionCompany } from '@/lib/notion/mapper';
import { DEMO_COMPANIES } from '@/lib/demo-data';

function dbToCompany(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, name: row.name, nameEn: row.name_en || undefined,
    type: row.type, country: row.country, email: row.email || undefined, phone: row.phone || undefined,
    website: row.website || undefined, wechat: row.wechat || undefined, memo: row.memo || undefined,
    ceo: row.ceo || undefined, businessNo: row.business_no || undefined,
    address: row.address || undefined, bank: row.bank || undefined,
    accountNo: row.account_no || undefined, currency: row.trade_currency || undefined,
    contactPerson: row.contact_person || undefined,
    bizRegFile: row.biz_reg_file || undefined,
    bankCopyFile: row.bank_copy_file || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET() {
  const db = getDb();

  // Sync from Notion (errors must not block SQLite fallback)
  try {
    const notionData = await fetchNotionCompanies();
    if (notionData.length > 0) {
      // INSERT OR REPLACE handles all UNIQUE conflicts (id PK + business_id UNIQUE)
      // by deleting the conflicting row and inserting the new one
      // INSERT OR IGNORE: only add new companies from Notion, never overwrite manual edits
      const insert = db.prepare(`INSERT OR IGNORE INTO companies
        (id,business_id,name,name_en,type,country,email,phone,website,wechat,memo,
         ceo,business_no,address,bank,account_no,trade_currency,notion_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      db.transaction(() => {
        for (const c of notionData) {
          insert.run(c.id, c.businessId, c.name, c.nameEn ?? null, c.type, c.country,
            c.email ?? null, c.phone ?? null, c.website ?? null, c.wechat ?? null,
            c.memo ?? null, c.ceo ?? null, c.businessNo ?? null, c.address ?? null,
            c.bank ?? null, c.accountNo ?? null, c.currency ?? null,
            c.id, c.createdAt, c.updatedAt);
        }
      })();
    }
  } catch (e) {
    console.error('[API companies GET] Notion sync error:', e);
    // Fall through — return whatever is in SQLite
  }

  // Always read from SQLite
  try {
    const rows = db.prepare('SELECT * FROM companies ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToCompany) });
  } catch (e) {
    console.error('[API companies GET] SQLite read error:', e);
  }

  return NextResponse.json({ data: DEMO_COMPANIES });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = body.preId || newId();
    const ts = now();
    const bizId = body.businessId || await nextBizId(db, 'CUS');

    db.prepare(`INSERT OR IGNORE INTO companies
      (id,business_id,name,name_en,type,country,email,phone,website,wechat,memo,
       ceo,business_no,address,bank,account_no,trade_currency,contact_person,
       notion_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, bizId, body.name, body.nameEn || null, body.type || '기타',
      body.country || '한국', body.email || null, body.phone || null,
      body.website || null, body.wechat || null, body.memo || null,
      body.ceo || null, body.businessNo || null, body.address || null,
      body.bank || null, body.accountNo || null, body.currency || null,
      body.contactPerson || null, null, ts, ts,
    );

    createNotionCompany({ id, businessId: bizId, name: body.name, nameEn: body.nameEn, type: body.type || '기타', country: body.country || '한국', email: body.email, phone: body.phone, website: body.website, wechat: body.wechat, memo: body.memo, createdAt: ts, updatedAt: ts } as any).then(notionId => {
      if (notionId) db.prepare('UPDATE companies SET notion_id=? WHERE id=?').run(notionId, id);
    }).catch(() => {});

    return NextResponse.json({ data: { id, businessId: bizId, ...body, createdAt: ts, updatedAt: ts } }, { status: 201 });
  } catch (e) {
    console.error('[API companies POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}

async function nextBizId(db: ReturnType<typeof import('@/lib/db/sqlite').getDb>, prefix: string): Promise<string> {
  const row = db.prepare(`SELECT business_id FROM companies WHERE business_id LIKE '${prefix}-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
  const last = row ? parseInt(row.business_id.split('-')[1] || '0') : 0;
  return `${prefix}-${String(last + 1).padStart(4, '0')}`;
}
