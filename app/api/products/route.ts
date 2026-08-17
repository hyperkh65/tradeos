import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';;
import { fetchNotionProducts, createNotionProduct } from '@/lib/notion/mapper';
import { DEMO_PRODUCTS } from '@/lib/demo-data';

export function dbToProduct(row: Record<string, unknown>) {
  const images: string[] = (() => {
    try { return JSON.parse((row.images_json as string) || '[]'); } catch { return []; }
  })();
  return {
    id: row.id, businessId: row.business_id, code: row.code,
    nameKo: row.name_ko, nameEn: row.name_en || undefined, category: row.category || undefined,
    supplierId: row.supplier_id || undefined, supplierName: row.supplier_name || undefined,
    status: row.status,
    purchasePrice: row.purchase_price || undefined, sellingPrice: row.selling_price || undefined,
    currency: row.currency, moq: row.moq || undefined, leadTimeDays: row.lead_time_days || undefined,
    hsCode: row.hs_code || undefined, countryOfOrigin: row.country_of_origin || undefined,
    imageUrl: images[0] || row.image_url || undefined,
    images,
    detail: row.detail || undefined, maker: row.maker || undefined,
    voltage: row.voltage || undefined, watts: row.watts || undefined, cct: row.cct || undefined,
    inputA: row.input_a || undefined, outputV: row.output_v || undefined, outputA: row.output_a || undefined,
    material: row.material || undefined, sizeSpec: row.size_spec || undefined, converter: row.converter || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const UPSERT_SQL = `INSERT OR REPLACE INTO products
  (id,business_id,code,name_ko,name_en,category,supplier_name,status,purchase_price,selling_price,currency,moq,lead_time_days,hs_code,country_of_origin,image_url,images_json,detail,maker,voltage,watts,cct,input_a,output_v,output_a,material,size_spec,converter,notion_id,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export async function GET() {
  try {
    const db = getDb();

    const notionData = await fetchNotionProducts();
    if (notionData.length > 0) {
      // INSERT OR IGNORE: never overwrite local edits with Notion data
      const insert = db.prepare(UPSERT_SQL.replace('INSERT OR REPLACE', 'INSERT OR IGNORE'));
      db.transaction(() => {
        for (const p of notionData) {
          // Check by both id AND business_id (local id ≠ Notion page id)
          const existing = db.prepare('SELECT id FROM products WHERE id=? OR business_id=? OR notion_id=?').get(p.id, p.businessId, p.id);
          if (existing) continue;
          const ex = p as any;
          const imagesJson = ex.imagesJson || (ex.imageUrl ? JSON.stringify([ex.imageUrl]) : null);
          insert.run(
            p.id, p.businessId, p.code, p.nameKo, p.nameEn ?? null, p.category ?? null,
            p.supplierName ?? null, p.status,
            p.purchasePrice ?? null, p.sellingPrice ?? null, p.currency,
            p.moq ?? null, p.leadTimeDays ?? null, p.hsCode ?? null, p.countryOfOrigin ?? null,
            ex.imageUrl ?? null, imagesJson ?? null,
            ex.detail ?? null, ex.maker ?? null,
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
    const id = body.preId || newId();
    const ts = now();

    const bizId = body.businessId || nextBizId('PRD', false);

    const images: string[] = body.images || [];
    const imagesJson = images.length > 0 ? JSON.stringify(images) : null;

    db.prepare(UPSERT_SQL).run(
      id, bizId, body.code, body.nameKo, body.nameEn ?? null, body.category ?? null,
      body.supplierName ?? null, body.status || 'active',
      body.purchasePrice ?? null, body.sellingPrice ?? null, body.currency || 'USD',
      body.moq ?? null, body.leadTimeDays ?? null, body.hsCode ?? null, body.countryOfOrigin ?? null,
      images[0] ?? null, imagesJson,
      body.detail ?? null, body.maker ?? null,
      body.voltage ?? null, body.watts ?? null, body.cct ?? null,
      body.inputA ?? null, body.outputV ?? null, body.outputA ?? null,
      body.material ?? null, body.sizeSpec ?? null, body.converter ?? null,
      null, ts, ts,
    );

    createNotionProduct({ ...body, businessId: bizId }).then(notionId => {
      if (notionId) db.prepare('UPDATE products SET notion_id=? WHERE id=?').run(notionId, id);
    }).catch(() => {});

    return NextResponse.json({ data: { id, businessId: bizId, ...body, images, createdAt: ts, updatedAt: ts } }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
