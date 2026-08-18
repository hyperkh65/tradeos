import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, nextBizId, now } from '@/lib/db/sqlite';

function rowToPA(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    title: row.title as string,
    analysisDate: (row.analysis_date as string) || undefined,
    saleId: (row.sale_id as string) || undefined,
    saleBusinessId: (row.sale_business_id as string) || undefined,
    importId: (row.import_id as string) || undefined,
    importBusinessId: (row.import_business_id as string) || undefined,
    saleAmount: (row.sale_amount as number) || 0,
    saleCurrency: (row.sale_currency as string) || 'KRW',
    exchangeRate: (row.exchange_rate as number) || 1,
    customsExRate: (row.customs_ex_rate as number) || 0,
    wireExRate: (row.wire_ex_rate as number) || 0,
    productItems: (() => { try { return JSON.parse((row.product_items_json as string) || '[]'); } catch { return []; } })(),
    freightCost: (row.freight_cost as number) || 0,
    inlandFreight: (row.inland_freight as number) || 0,
    brokerFee: (row.broker_fee as number) || 0,
    duty: (row.duty as number) || 0,
    vatImport: (row.vat_import as number) || 0,
    wireFee: (row.wire_fee as number) || 0,
    extraCosts: (() => { try { return JSON.parse((row.extra_costs_json as string) || '[]'); } catch { return []; } })(),
    memo: (row.memo as string) || undefined,
    status: (row.status as string) || 'draft',
    history: (() => { try { return JSON.parse((row.history_json as string) || '[]'); } catch { return []; } })(),
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  let rows: Record<string, unknown>[];
  if (q) {
    rows = db.prepare(`SELECT * FROM profit_analyses WHERE title LIKE ? OR business_id LIKE ? OR sale_business_id LIKE ? OR import_business_id LIKE ? ORDER BY updated_at DESC LIMIT 100`)
      .all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`) as Record<string, unknown>[];
  } else {
    rows = db.prepare(`SELECT * FROM profit_analyses ORDER BY updated_at DESC LIMIT 100`).all() as Record<string, unknown>[];
  }
  return NextResponse.json({ data: rows.map(rowToPA) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = newId();
  const bizId = nextBizId('PA');
  const ts = now();

  const history = JSON.stringify([{ at: ts, by: body.createdBy || 'system', action: '생성', note: body.title }]);

  db.prepare(`INSERT INTO profit_analyses
    (id,business_id,title,analysis_date,sale_id,sale_business_id,import_id,import_business_id,
     sale_amount,sale_currency,exchange_rate,customs_ex_rate,wire_ex_rate,product_items_json,
     freight_cost,inland_freight,broker_fee,duty,vat_import,wire_fee,extra_costs_json,
     memo,status,history_json,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id, bizId,
      body.title || '새 수익분석',
      body.analysisDate || ts.slice(0, 10),
      body.saleId || null, body.saleBusinessId || null,
      body.importId || null, body.importBusinessId || null,
      body.saleAmount || 0,
      body.saleCurrency || 'KRW',
      body.exchangeRate || 1,
      body.customsExRate || 0,
      body.wireExRate || 0,
      JSON.stringify(body.productItems || []),
      body.freightCost || 0,
      body.inlandFreight || 0,
      body.brokerFee || 0,
      body.duty || 0,
      body.vatImport || 0,
      body.wireFee || 0,
      JSON.stringify(body.extraCosts || []),
      body.memo || null,
      body.status || 'draft',
      history,
      body.createdBy || null,
      ts, ts,
    );

  const row = db.prepare('SELECT * FROM profit_analyses WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: rowToPA(row) }, { status: 201 });
}
