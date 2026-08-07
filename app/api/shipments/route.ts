import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { DEMO_SHIPMENTS } from '@/lib/demo-data';

function dbToShipment(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, type: row.type,
    forwarderId: row.forwarder_id || undefined, forwarderName: row.forwarder_name || undefined,
    origin: row.origin || undefined, pol: row.pol || undefined, pod: row.pod || undefined,
    etd: row.etd || undefined, eta: row.eta || undefined,
    vessel: row.vessel || undefined, voyage: row.voyage || undefined, blNo: row.bl_no || undefined,
    cbm: row.cbm || undefined, grossWeight: row.gross_weight || undefined,
    poIds: JSON.parse(row.po_ids_json as string || '[]'),
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM shipments ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToShipment) });

    const seed = db.prepare(`INSERT OR IGNORE INTO shipments (id,business_id,type,forwarder_id,forwarder_name,origin,pol,pod,etd,eta,vessel,voyage,bl_no,cbm,gross_weight,po_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const s of DEMO_SHIPMENTS) {
        seed.run(s.id, s.businessId, s.type, s.forwarderId ?? null, s.forwarderName ?? null, s.origin ?? null, s.pol ?? null, s.pod ?? null, s.etd ?? null, s.eta ?? null, s.vessel ?? null, s.voyage ?? null, s.blNo ?? null, s.cbm ?? null, s.grossWeight ?? null, JSON.stringify(s.poIds ?? []), s.status, s.createdAt, s.updatedAt);
      }
    })();
    return NextResponse.json({ data: DEMO_SHIPMENTS });
  } catch {
    return NextResponse.json({ data: DEMO_SHIPMENTS });
  }
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

    db.prepare(`INSERT INTO shipments (id,business_id,type,forwarder_id,forwarder_name,origin,pol,pod,etd,eta,vessel,voyage,bl_no,cbm,gross_weight,po_ids_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, bizId, body.type || 'LCL', body.forwarderId ?? null, body.forwarderName ?? null, body.origin ?? null, body.pol ?? null, body.pod ?? null, body.etd ?? null, body.eta ?? null, body.vessel ?? null, body.voyage ?? null, body.blNo ?? null, body.cbm ?? null, body.grossWeight ?? null, JSON.stringify(body.poIds || []), body.status || 'booked', ts, ts);

    return NextResponse.json({ data: { id, businessId: bizId, ...body, createdAt: ts, updatedAt: ts } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
