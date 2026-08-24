import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { fetchNotionProducts } from '@/lib/notion/mapper';

const UPSERT_SQL = `INSERT OR REPLACE INTO products
  (id,business_id,code,name_ko,name_en,category,supplier_name,status,purchase_price,selling_price,currency,moq,lead_time_days,hs_code,country_of_origin,image_url,images_json,detail,maker,voltage,watts,cct,input_a,output_v,output_a,material,size_spec,converter,notion_id,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export async function POST() {
  try {
    const notionData = await fetchNotionProducts();
    if (notionData.length === 0) {
      return NextResponse.json({ synced: 0, message: 'Notion 제품 없음 또는 데모 모드' });
    }

    const db = getDb();
    const upsert = db.prepare(UPSERT_SQL);
    let synced = 0;

    const findExisting = db.prepare('SELECT id FROM products WHERE id=? OR business_id=? OR notion_id=?');

    db.transaction(() => {
      for (const p of notionData) {
        const ex = p as any;
        const imagesJson = ex.imagesJson || (ex.imageUrl ? JSON.stringify([ex.imageUrl]) : null);
        // 노션 페이지 id를 그대로 로컬 id로 써서 upsert하면, 로컬에서 만들어진(다른 id를 가진)
        // 제품이 나중에 노션에도 저장된 경우 여기서 "새 제품"으로 다시 삽입되어 중복이 생겼다.
        // business_id/notion_id로 기존 행을 먼저 찾아 같은 id를 유지한다.
        const existing = findExisting.get(p.id, p.businessId, p.id) as { id: string } | undefined;
        const localId = existing?.id || p.id;
        try {
          upsert.run(
            localId, p.businessId, p.code, p.nameKo || '(제목없음)', p.nameEn ?? null, p.category ?? null,
            p.supplierName ?? null, p.status || 'active',
            p.purchasePrice ?? null, p.sellingPrice ?? null, p.currency || 'USD',
            p.moq ?? null, p.leadTimeDays ?? null, p.hsCode ?? null, p.countryOfOrigin ?? null,
            ex.imageUrl ?? null, imagesJson ?? null,
            ex.detail ?? null, ex.maker ?? null,
            ex.voltage ?? null, ex.watts ?? null, ex.cct ?? null,
            ex.inputA ?? null, ex.outputV ?? null, ex.outputA ?? null,
            ex.material ?? null, ex.sizeSpec ?? null, ex.converter ?? null,
            p.id, p.createdAt, p.updatedAt,
          );
          synced++;
        } catch (e) {
          console.error('[sync] product upsert error:', p.id, e);
        }
      }
    })();

    const total = (db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number }).c;
    return NextResponse.json({ synced, total, notionCount: notionData.length });
  } catch (e) {
    console.error('[products/sync]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
