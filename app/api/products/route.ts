import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionProducts, createNotionProduct } from '@/lib/notion/mapper';
import { DEMO_PRODUCTS } from '@/lib/demo-data';

function dbToProduct(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, code: row.code,
    nameKo: row.name_ko, nameEn: row.name_en||undefined, category: row.category||undefined,
    supplierId: row.supplier_id||undefined, supplierName: row.supplier_name||undefined,
    status: row.status, purchasePrice: row.purchase_price||undefined, sellingPrice: row.selling_price||undefined,
    currency: row.currency, moq: row.moq||undefined, leadTimeDays: row.lead_time_days||undefined,
    hsCode: row.hs_code||undefined, countryOfOrigin: row.country_of_origin||undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    const db = getDb();

    const notionData = await fetchNotionProducts();
    if (notionData.length > 0) {
      const upsert = db.prepare(`INSERT OR REPLACE INTO products (id,business_id,code,name_ko,name_en,category,supplier_name,status,purchase_price,selling_price,currency,moq,lead_time_days,hs_code,country_of_origin,notion_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const syncAll = db.transaction(() => {
        for (const p of notionData) {
          upsert.run(p.id,p.businessId,p.code,p.nameKo,p.nameEn??null,p.category??null,p.supplierName??null,p.status,p.purchasePrice??null,p.sellingPrice??null,p.currency,p.moq??null,p.leadTimeDays??null,p.hsCode??null,p.countryOfOrigin??null,p.id,p.createdAt,p.updatedAt);
        }
      });
      syncAll();
      return NextResponse.json({ data: notionData });
    }

    const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToProduct) });

    // Seed
    const seed = db.prepare(`INSERT OR IGNORE INTO products (id,business_id,code,name_ko,name_en,category,supplier_id,supplier_name,status,purchase_price,selling_price,currency,moq,lead_time_days,hs_code,country_of_origin,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const seedAll = db.transaction(() => {
      for (const p of DEMO_PRODUCTS) {
        seed.run(p.id,p.businessId,p.code,p.nameKo,p.nameEn??null,p.category??null,p.supplierId??null,p.supplierName??null,p.status,p.purchasePrice??null,p.sellingPrice??null,p.currency,p.moq??null,p.leadTimeDays??null,p.hsCode??null,p.countryOfOrigin??null,p.createdAt,p.updatedAt);
      }
    });
    seedAll();
    return NextResponse.json({ data: DEMO_PRODUCTS });
  } catch (e) {
    return NextResponse.json({ data: DEMO_PRODUCTS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM products WHERE business_id LIKE 'PRD-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.split('-')[1] || '0') : 0;
    const bizId = body.businessId || `PRD-${String(lastNum + 1).padStart(4, '0')}`;

    db.prepare(`INSERT INTO products (id,business_id,code,name_ko,name_en,category,supplier_id,supplier_name,status,purchase_price,selling_price,currency,moq,lead_time_days,hs_code,country_of_origin,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,bizId,body.code,body.nameKo,body.nameEn??null,body.category??null,body.supplierId??null,body.supplierName??null,body.status||'active',body.purchasePrice??null,body.sellingPrice??null,body.currency||'USD',body.moq??null,body.leadTimeDays??null,body.hsCode??null,body.countryOfOrigin??null,ts,ts);

    createNotionProduct({ ...body, businessId: bizId }).then(notionId => {
      if (notionId) db.prepare('UPDATE products SET notion_id=? WHERE id=?').run(notionId, id);
    }).catch(() => {});

    return NextResponse.json({ data: { id, businessId: bizId, ...body, createdAt: ts, updatedAt: ts } }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
