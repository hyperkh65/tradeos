import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

export interface EstimatorCase {
  id: string; name: string;
  containerType: '20ft' | '40ft' | '40HQ';
  freightSeaUsd?: number;
  freightSea: number; freightInland: number; freightPort: number; freightMisc: number;
  fxUsd: number; fxRmb: number;
  dutyRate: number;
  eprRate: number;
  simMode: 'standard' | 'reverse' | 'mixed';
  items: EstimatorItem[];
  notes?: string;
  createdAt: string; updatedAt: string;
}

export interface EstimatorItem {
  id: string; name: string;
  currency: 'USD' | 'CNY';
  fobPrice: number;
  boxL: number; boxW: number; boxH: number;
  qtyPerBox: number;
  weightG?: number;
  eprWeightG?: number;
  dutyRateOverride?: number;
  sellingPrice?: number;
  targetMargin?: number;
  mixedCbm?: number;
  note?: string;
}

function rowToCase(row: Record<string, unknown>): EstimatorCase {
  return {
    id: row.id as string, name: row.name as string,
    containerType: (row.container_type as EstimatorCase['containerType']) || '40ft',
    freightSeaUsd: row.freight_sea_usd != null ? (row.freight_sea_usd as number) : undefined,
    freightSea: (row.freight_sea as number) || 0,
    freightInland: (row.freight_inland as number) || 0,
    freightPort: (row.freight_port as number) || 0,
    freightMisc: (row.freight_misc as number) || 0,
    fxUsd: (row.fx_usd as number) || 1330,
    fxRmb: (row.fx_rmb as number) || 185,
    dutyRate: (row.duty_rate as number) ?? 0.024,
    eprRate: (row.epr_rate as number) ?? 0,
    simMode: (row.sim_mode as EstimatorCase['simMode']) || 'standard',
    items: (() => { try { return JSON.parse((row.items_json as string) || '[]'); } catch { return []; } })(),
    notes: (row.notes as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM estimator_cases ORDER BY updated_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(rowToCase) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO estimator_cases (id,name,container_type,freight_sea_usd,freight_sea,freight_inland,freight_port,freight_misc,fx_usd,fx_rmb,duty_rate,epr_rate,sim_mode,items_json,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, body.name || '새 케이스', body.containerType || '40ft',
      body.freightSeaUsd ?? null, body.freightSea ?? 930000,
      body.freightInland ?? 250000, body.freightPort ?? 280000, body.freightMisc ?? 0,
      body.fxUsd ?? 1430, body.fxRmb ?? 195, body.dutyRate ?? 0.024, body.eprRate ?? 0,
      body.simMode || 'standard', JSON.stringify(body.items || []), body.notes ?? null, ts, ts);
  const row = db.prepare('SELECT * FROM estimator_cases WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: rowToCase(row) }, { status: 201 });
}
