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

    const findExisting = db.prepare('SELECT * FROM products WHERE id=? OR business_id=? OR notion_id=?');

    db.transaction(() => {
      for (const p of notionData) {
        const ex = p as any;
        // 노션 페이지 id를 그대로 로컬 id로 써서 upsert하면, 로컬에서 만들어진(다른 id를 가진)
        // 제품이 나중에 노션에도 저장된 경우 여기서 "새 제품"으로 다시 삽입되어 중복이 생겼다.
        // business_id/notion_id로 기존 행을 먼저 찾아 같은 id를 유지한다.
        const existing = findExisting.get(p.id, p.businessId, p.id) as Record<string, unknown> | undefined;
        const localId = existing?.id as string || p.id;
        // businessId는 매퍼에서 항상 노션 페이지 id를 그대로 쓰기 때문에(제품코드 중복 가능해서),
        // 로컬에서 이미 깔끔한 발주번호(PRD-XXXX)를 갖고 있었다면 그걸 유지해야 한다.
        const businessId = (existing?.business_id as string) || p.businessId;

        // 이미지 등 일부 항목은 앱에서만 관리하고 노션에는 절대 올리지 않는다(편도 동기화).
        // 노션 쪽 값이 비어 있다고 그걸 그대로 덮어쓰면 로컬에만 있던 값이 사라지므로,
        // 노션에 값이 있을 때만 갱신하고 없으면 기존 로컬 값을 유지한다.
        const keep = <T>(notionVal: T | null | undefined, field: string): T | null =>
          (notionVal ?? (existing?.[field] as T | undefined)) ?? null;

        const imagesJson = ex.imagesJson || (ex.imageUrl ? JSON.stringify([ex.imageUrl]) : null);

        try {
          upsert.run(
            localId, businessId, p.code, p.nameKo || '(제목없음)',
            keep(p.nameEn, 'name_en'), keep(p.category, 'category'),
            keep(p.supplierName, 'supplier_name'), p.status || 'active',
            keep(p.purchasePrice, 'purchase_price'), keep(p.sellingPrice, 'selling_price'), p.currency || 'USD',
            keep(p.moq, 'moq'), keep(p.leadTimeDays, 'lead_time_days'), keep(p.hsCode, 'hs_code'), keep(p.countryOfOrigin, 'country_of_origin'),
            keep(ex.imageUrl, 'image_url'), keep(imagesJson, 'images_json'),
            keep(ex.detail, 'detail'), keep(ex.maker, 'maker'),
            keep(ex.voltage, 'voltage'), keep(ex.watts, 'watts'), keep(ex.cct, 'cct'),
            keep(ex.inputA, 'input_a'), keep(ex.outputV, 'output_v'), keep(ex.outputA, 'output_a'),
            keep(ex.material, 'material'), keep(ex.sizeSpec, 'size_spec'), keep(ex.converter, 'converter'),
            p.id, existing?.created_at as string || p.createdAt, p.updatedAt,
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
