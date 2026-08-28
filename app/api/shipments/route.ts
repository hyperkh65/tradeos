import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';;
import { fetchNotionShipments, createNotionShipment } from '@/lib/notion/mapper';
import type { Shipment } from '@/types';
import { syncIndexOnWrite } from '@/lib/ai/sync';

export function dbToShipment(row: Record<string, unknown>): Shipment {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    type: (row.type as Shipment['type']) || 'LCL',
    forwarderId: (row.forwarder_id as string) || undefined,
    forwarderName: (row.forwarder_name as string) || undefined,
    origin: (row.origin as string) || undefined,
    pol: (row.pol as string) || undefined,
    pod: (row.pod as string) || undefined,
    etd: (row.etd as string) || undefined,
    eta: (row.eta as string) || undefined,
    vessel: (row.vessel as string) || undefined,
    voyage: (row.voyage as string) || undefined,
    blNo: (row.bl_no as string) || undefined,
    containerNo: (row.container_no as string) || undefined,
    cbm: (row.cbm as number) || undefined,
    grossWeight: (row.gross_weight as number) || undefined,
    freightCost: (row.freight_cost as number) || undefined,
    freightCurrency: (row.freight_currency as string) || 'USD',
    packingListUrl: (row.packing_list_url as string) || undefined,
    documents: (() => { try { return JSON.parse((row.documents_json as string) || '[]'); } catch { return []; } })(),
    cargoItems: (() => { try { return JSON.parse((row.cargo_items_json as string) || '[]'); } catch { return []; } })(),
    poIds: (() => { try { return JSON.parse((row.po_ids_json as string) || '[]'); } catch { return []; } })(),
    status: (row.status as Shipment['status']) || 'booked',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function syncShipmentToDb(db: ReturnType<typeof getDb>, body: Record<string, unknown>, id: string, ts: string, existingCreatedAt?: string) {
  const cargoItems = body.cargoItems || [];
  const poIds = Array.isArray(body.poIds) ? body.poIds
    : (cargoItems as { poId?: string }[]).map(i => i.poId).filter(Boolean);

  db.prepare(`INSERT OR REPLACE INTO shipments
    (id,business_id,type,forwarder_id,forwarder_name,origin,pol,pod,etd,eta,vessel,voyage,bl_no,container_no,cbm,gross_weight,freight_cost,freight_currency,packing_list_url,cargo_items_json,po_ids_json,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id, body.businessId, body.type || 'LCL',
      body.forwarderId ?? null, body.forwarderName ?? null,
      body.origin ?? null, body.pol ?? null, body.pod ?? null,
      body.etd ?? null, body.eta ?? null,
      body.vessel ?? null, body.voyage ?? null,
      body.blNo ?? null, body.containerNo ?? null,
      body.cbm ?? null, body.grossWeight ?? null,
      body.freightCost ?? null, body.freightCurrency ?? 'USD',
      body.packingListUrl ?? null,
      JSON.stringify(cargoItems),
      JSON.stringify(poIds),
      body.status || 'booked',
      existingCreatedAt || ts, ts,
    );
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = req.nextUrl;
  const bizId = searchParams.get('bizId');
  const skipNotion = searchParams.get('skipNotion') === '1' || !!bizId;

  // bizId 단일 조회: Notion 건너뛰고 로컬만 (빠른 경로)
  if (bizId) {
    const row = db.prepare(
      'SELECT * FROM shipments WHERE (local_deleted=0 OR local_deleted IS NULL) AND business_id=? LIMIT 1'
    ).get(bizId) as Record<string, unknown> | undefined;
    return NextResponse.json({ data: row ? [dbToShipment(row)] : [] });
  }

  // 전체 목록: Notion 동기화 포함 (명시적으로 skipNotion=1이 아닌 경우)
  if (!skipNotion) {
    const ts = now();
    try {
      const notionShipments = await fetchNotionShipments();
      if (notionShipments.length > 0) {
        db.transaction(() => {
          for (const s of notionShipments) {
            const existing = db.prepare('SELECT id, local_deleted FROM shipments WHERE id=? OR business_id=?').get(s.id, (s as any).businessId) as { id: string; local_deleted: number } | undefined;
            if (existing) continue;
            syncShipmentToDb(db, { ...s, cargoItems: (s as any).cargoItems || [] }, s.id, ts, s.createdAt);
          }
        })();
      }
    } catch (e) {
      console.error('[Shipments] Notion fetch error:', e);
    }
  }

  const rows = db.prepare('SELECT * FROM shipments WHERE local_deleted=0 OR local_deleted IS NULL ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const res = NextResponse.json({ data: rows.map(dbToShipment) });
  // 목록은 30초 stale-while-revalidate 캐시
  res.headers.set('Cache-Control', 'private, max-age=0, stale-while-revalidate=30');
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    body.businessId = body.businessId || nextBizId('SHP');
    body.id = id;

    const shipment = { ...body, id, createdAt: ts, updatedAt: ts };
    await createNotionShipment(shipment as Shipment).catch(() => null);

    syncShipmentToDb(db, body, id, ts);
    syncIndexOnWrite('shipment', id);
    return NextResponse.json({ data: dbToShipment(db.prepare('SELECT * FROM shipments WHERE id=?').get(id) as Record<string, unknown>) }, { status: 201 });
  } catch (e) {
    console.error('[shipments POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
