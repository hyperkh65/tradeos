import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionProducts, createNotionProduct } from '@/lib/notion/mapper';
import { DEMO_PRODUCTS } from '@/lib/demo-data';

function dbToProduct(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, code: row.code,
    nameKo: row.name_ko, nameEn: row.name_en || undefined, category: row.category || undefined,
    supplierId: row.supplier_id || undefined, supplierName: row.supplier_name || undefined,
    status: row.status,
    purchasePrice: row.purchase_price || undefined, sellingPrice: row.selling_price || undefined,
    currency: row.currency, moq: row.moq || undefined, leadTimeDays: row.lead_time_days || undefined,
    hsCode: row.hs_code || undefined, countryOfOrigin: row.country_of_origin || undefined,
    imageUrl: row.image_url || undefined,
    detail: row.detail || undefined, maker: row.maker || undefined,
    voltage: row.voltage || undefined, watts: row.watts || undefined, cct: row.cct || undefined,
    inputA: row.input_a || undefined, outputV: row.output_v || undefined, outputA: row.output_a || undefined,
    material: row.material || undefined, sizeSpec: row.size_spec || undefined, converter: row.converter || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const UPSERT_SQL = `INSERT OR REPLACE INTO products
  (id,business_id,code,name_ko,name_en,category,supplier_name,status,purchase_price,selling_price,currency,moq,lead_time_days,hs_code,country_of_origin,image_url,detail,maker,voltage,watts,cct,input_a,output_v,output_a,material,size_spec,converter,notion_id,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export async function GET() {
  try {
    const db = getDb();

    const notionData = await fetchNotionProducts();
    if (notionData.length > 0) {
      const upsert = db.prepare(UPSERT_SQL);
      db.transaction(() => {
        for (const p of notionData) {
          const existing = db.prepare('SELECT updated_at FROM products WHERE id=?').get(p.id) as { updated_at: string } | undefined;
          if (existing && existing.updated_at > p.updatedAt) continue; // local edit is newer, skip
          const ex = p as any;
          upsert.run(
            p.id, p.businessId, p.code, p.nameKo, p.nameEn ?? null, p.category ?? null,
            p.supplierName ?? null, p.status,
            p.purchasePrice ?? null, p.sellingPrice ?? null, p.currency,
            p.moq ?? null, p.leadTimeDays ?? null, p.hsCode ?? null, p.countryOfOrigin ?? null,
            ex.imageUrl ?? null, ex.detail ?? null, ex.maker ?? null,
            ex.voltage ?? null, ex.watts ?? null, ex.cct ?? null,
            ex.inputA ?? null, ex.outputV ?? null, ex.outputA ?? null,
            ex.material ?? null, ex.sizeSpec ?? null, ex.converter ?? null,
            p.id, p.createdAt, p.updatedAt,
          );
        }
      })();
    }

    const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToProduct) });

    if (notionData.length > 0) return NextResponse.json({ data: notionData });

    // Seed demo data
    const seed = db.prepare(`INSERT OR IGNORE INTO products (id,business_id,code,name_ko,name_en,category,supplier_id,supplier_name,status,purchase_price,selling_price,currency,moq,lead_time_days,hs_code,country_of_origin,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const p of DEMO_PRODUCTS) {
        seed.run(p.id, p.businessId, p.code, p.nameKo, p.nameEn ?? null, p.category ?? null, p.supplierId ?? null, p.supplierName ?? null, p.status, p.purchasePrice ?? null, p.sellingPrice ?? null, p.currency, p.moq ?? null, p.leadTimeDays ?? null, p.hsCode ?? null, p.countryOfOrigin ?? null, p.createdAt, p.updatedAt);
      }
    })();
    return NextResponse.json({ data: DEMO_PRODUCTS });
  } catch (e) {
    console.error('[products GET]', e);
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

    db.prepare(UPSERT_SQL).run(
      id, bizId, body.code, body.nameKo, body.nameEn ?? null, body.category ?? null,
      body.supplierName ?? null, body.status || 'active',
      body.purchasePrice ?? null, body.sellingPrice ?? null, body.currency || 'USD',
      body.moq ?? null, body.leadTimeDays ?? null, body.hsCode ?? null, body.countryOfOrigin ?? null,
      body.imageUrl ?? null, body.detail ?? null, body.maker ?? null,
      body.voltage ?? null, body.watts ?? null, body.cct ?? null,
      body.inputA ?? null, body.outputV ?? null, body.outputA ?? null,
      body.material ?? null, body.sizeSpec ?? null, body.converter ?? null,
      null, ts, ts,
    );

    createNotionProduct({ ...body, businessId: bizId }).then(notionId => {
      if (notionId) db.prepare('UPDATE products SET notion_id=? WHERE id=?').run(notionId, id);
    }).catch(() => {});

    return NextResponse.json({ data: { id, businessId: bizId, ...body, createdAt: ts, updatedAt: ts } }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
