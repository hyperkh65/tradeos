import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionShipments, createNotionShipment } from '@/lib/notion/mapper';
import type { Shipment } from '@/types';

function dbToShipment(row: Record<string, unknown>): Shipment {
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
    cbm: (row.cbm as number) || undefined,
    grossWeight: (row.gross_weight as number) || undefined,
    poIds: JSON.parse(row.po_ids_json as string || '[]'),
    status: (row.status as Shipment['status']) || 'booked',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function syncShipmentToDb(db: ReturnType<typeof getDb>, s: Shipment, ts: string) {
  db.prepare(`INSERT OR REPLACE INTO shipments
    (id,business_id,type,forwarder_id,forwarder_name,origin,pol,pod,etd,eta,vessel,voyage,bl_no,cbm,gross_weight,po_ids_json,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(s.id, s.businessId, s.type, s.forwarderId ?? null, s.forwarderName ?? null,
      s.origin ?? null, s.pol ?? null, s.pod ?? null, s.etd ?? null, s.eta ?? null,
      s.vessel ?? null, s.voyage ?? null, s.blNo ?? null, s.cbm ?? null,
      s.grossWeight ?? null, JSON.stringify(s.poIds ?? []), s.status,
      s.createdAt || ts, ts);
}

export async function GET() {
  const db = getDb();
  const ts = now();

  try {
    const notionShipments = await fetchNotionShipments();
    if (notionShipments.length > 0) {
      db.transaction(() => {
        for (const s of notionShipments) syncShipmentToDb(db, s, ts);
      })();
      return NextResponse.json({ data: notionShipments });
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
    const bizId = body.businessId || `SHP-${year}-${String(lastNum + 1).padStart(4, '0')}`;

    const shipment: Shipment = {
      id, businessId: bizId, type: body.type || 'LCL',
      forwarderId: body.forwarderId, forwarderName: body.forwarderName,
      origin: body.origin, pol: body.pol, pod: body.pod,
      etd: body.etd, eta: body.eta, vessel: body.vessel, voyage: body.voyage,
      blNo: body.blNo, cbm: body.cbm, grossWeight: body.grossWeight,
      poIds: body.poIds || [],
      status: body.status || 'booked',
      createdAt: ts, updatedAt: ts,
    };

    // Save to Notion (ERP)
    await createNotionShipment(shipment).catch(() => null);

    syncShipmentToDb(db, shipment, ts);
    return NextResponse.json({ data: shipment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
