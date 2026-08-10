import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionImports } from '@/lib/notion/mapper';
import type { Import } from '@/types';

function dbToImport(row: Record<string, unknown>): Import {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    shipmentId: row.shipment_id as string,
    shipmentBusinessId: row.shipment_business_id as string,
    brokerName: (row.broker_name as string) || undefined,
    declarationNo: (row.declaration_no as string) || undefined,
    releaseDate: (row.release_date as string) || undefined,
    hsCode: (row.hs_code as string) || undefined,
    dutyRate: (row.duty_rate as number) || undefined,
    duty: (row.duty as number) || undefined,
    vat: (row.vat as number) || undefined,
    brokerFee: (row.broker_fee as number) || undefined,
    ftaApplicable: Boolean(row.fta_applicable),
    coStatus: (row.co_status as Import['coStatus']) || undefined,
    status: (row.status as Import['status']) || 'in_progress',
    createdAt: row.created_at as string,
  };
}

function syncImportToDb(db: ReturnType<typeof getDb>, imp: Import) {
  db.prepare(`INSERT OR REPLACE INTO imports
    (id,business_id,shipment_id,shipment_business_id,broker_name,declaration_no,release_date,hs_code,duty_rate,duty,vat,broker_fee,fta_applicable,co_status,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(imp.id, imp.businessId, imp.shipmentId, imp.shipmentBusinessId,
      imp.brokerName ?? null, imp.declarationNo ?? null, imp.releaseDate ?? null,
      imp.hsCode ?? null, imp.dutyRate ?? null, imp.duty ?? null, imp.vat ?? null,
      imp.brokerFee ?? null, imp.ftaApplicable ? 1 : 0, imp.coStatus ?? null,
      imp.status, imp.createdAt);
}

export async function GET() {
  const db = getDb();

  try {
    const notionImports = await fetchNotionImports();
    if (notionImports.length > 0) {
      db.transaction(() => {
        for (const imp of notionImports) syncImportToDb(db, imp);
      })();
      return NextResponse.json({ data: notionImports });
    }
  } catch (e) {
    console.error('[Imports] Notion fetch error:', e);
  }

  const rows = db.prepare('SELECT * FROM imports ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToImport) });
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

    const imp: Import = {
      id, businessId: bizId,
      shipmentId: body.shipmentId || '',
      shipmentBusinessId: body.shipmentBusinessId || '',
      brokerName: body.brokerName, declarationNo: body.declarationNo,
      releaseDate: body.releaseDate, hsCode: body.hsCode,
      dutyRate: body.dutyRate, duty: body.duty, vat: body.vat,
      brokerFee: body.brokerFee, ftaApplicable: body.ftaApplicable || false,
      coStatus: body.coStatus,
      status: body.status || 'in_progress',
      createdAt: ts,
    };

    syncImportToDb(db, imp);
    return NextResponse.json({ data: imp }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
