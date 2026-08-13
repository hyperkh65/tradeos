import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionShipments, createNotionShipment } from '@/lib/notion/mapper';
import type { Shipment } from '@/types';

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

export async function GET() {
  const db = getDb();
  const ts = now();

  try {
    const notionShipments = await fetchNotionShipments();
    if (notionShipments.length > 0) {
      db.transaction(() => {
        for (const s of notionShipments) {
          syncShipmentToDb(db, { ...s, cargoItems: (s as any).cargoItems || [] }, s.id, ts, s.createdAt);
        }
      })();
    }
  } catch (e) {
    console.error('[Shipments] Notion fetch error:', e);
  }

  const rows = db.prepare('SELECT * FROM shipments ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToShipment) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM shipments WHERE business_id LIKE 'SHP-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g, '') || '0') : 0;
    const year = new Date().getFullYear();
    body.businessId = body.businessId || `SHP-${year}-${String(lastNum + 1).padStart(4, '0')}`;
    body.id = id;

    const shipment = { ...body, id, createdAt: ts, updatedAt: ts };
    await createNotionShipment(shipment as Shipment).catch(() => null);

    syncShipmentToDb(db, body, id, ts);
    return NextResponse.json({ data: dbToShipment(db.prepare('SELECT * FROM shipments WHERE id=?').get(id) as Record<string, unknown>) }, { status: 201 });
  } catch (e) {
    console.error('[shipments POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
