import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { DEMO_IMPORTS } from '@/lib/demo-data';

function dbToImport(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id,
    shipmentId: row.shipment_id, shipmentBusinessId: row.shipment_business_id,
    brokerName: row.broker_name || undefined, declarationNo: row.declaration_no || undefined,
    releaseDate: row.release_date || undefined, hsCode: row.hs_code || undefined,
    dutyRate: row.duty_rate || undefined, duty: row.duty || undefined,
    vat: row.vat || undefined, brokerFee: row.broker_fee || undefined,
    ftaApplicable: Boolean(row.fta_applicable), coStatus: row.co_status || undefined,
    status: row.status, createdAt: row.created_at,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM imports ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToImport) });

    const seed = db.prepare(`INSERT OR IGNORE INTO imports (id,business_id,shipment_id,shipment_business_id,broker_name,declaration_no,release_date,hs_code,duty_rate,duty,vat,broker_fee,fta_applicable,co_status,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const imp of DEMO_IMPORTS) {
        seed.run(imp.id, imp.businessId, imp.shipmentId, imp.shipmentBusinessId, imp.brokerName ?? null, imp.declarationNo ?? null, imp.releaseDate ?? null, imp.hsCode ?? null, imp.dutyRate ?? null, imp.duty ?? null, imp.vat ?? null, imp.brokerFee ?? null, imp.ftaApplicable ? 1 : 0, imp.coStatus ?? null, imp.status, imp.createdAt);
      }
    })();
    return NextResponse.json({ data: DEMO_IMPORTS });
  } catch {
    return NextResponse.json({ data: DEMO_IMPORTS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM imports WHERE business_id LIKE 'IMP-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g, '') || '0') : 0;
    const year = new Date().getFullYear();
    const bizId = body.businessId || `IMP-${year}-${String(lastNum + 1).padStart(4, '0')}`;

    db.prepare(`INSERT INTO imports (id,business_id,shipment_id,shipment_business_id,broker_name,declaration_no,release_date,hs_code,duty_rate,duty,vat,broker_fee,fta_applicable,co_status,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, bizId, body.shipmentId || '', body.shipmentBusinessId || '', body.brokerName ?? null, body.declarationNo ?? null, body.releaseDate ?? null, body.hsCode ?? null, body.dutyRate ?? null, body.duty ?? null, body.vat ?? null, body.brokerFee ?? null, body.ftaApplicable ? 1 : 0, body.coStatus ?? null, body.status || 'in_progress', ts);

    return NextResponse.json({ data: { id, businessId: bizId, ...body, createdAt: ts } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
