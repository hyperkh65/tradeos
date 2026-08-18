import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

export interface EstimatorCase {
  id: string; name: string;
  containerType: '20ft' | '40ft' | '40HQ';
  freightSeaUsd?: number;
  freightSea: number; freightInland: number; freightPort: number; freightMisc: number;
  fxUsd: number;      // 구매·비용 환율 (USD/KRW)
  fxUsdSell: number;  // 판매·견적 환율 (USD/KRW)
  fxRmb: number;      // 구매 RMB/KRW
  fxRmbSell: number;  // 판매·견적 RMB/KRW
  dutyRate: number;
  eprRate: number;
  eprObligationRate: number;  // 재활용의무율 (예: 0.20 = 20%)
  portFrom?: string;
  portTo?: string;
  simMode: 'standard' | 'reverse' | 'mixed';
  items: EstimatorItem[];
  notes?: string;
  createdAt: string; updatedAt: string;
}

export interface ItemCert {
  id: string; name: string;
  totalCostKrw: number;  // 총 인증 비용 (원)
  shipQty: number;       // 회수 물량 (개)
}
export interface EstimatorItem {
  id: string; name: string;
  currency: 'USD' | 'CNY';
  sellingCurrency?: 'USD' | 'CNY' | 'KRW';
  fobPrice: number;
  boxL: number; boxW: number; boxH: number;
  qtyPerBox: number;
  weightG?: number;          // 단중 (g/pcs) — EPR 계산에 사용
  certs?: ItemCert[];        // 제품별 인증비
  dutyRateOverride?: number;
  sellingPrice?: number;
  targetMargin?: number;
  mixedCbm?: number;
  note?: string;
}

function rowToCase(row: Record<string, unknown>): EstimatorCase {
  const fxUsd = (row.fx_usd as number) || 1430;
  return {
    id: row.id as string, name: row.name as string,
    containerType: (row.container_type as EstimatorCase['containerType']) || '40ft',
    freightSeaUsd: row.freight_sea_usd != null ? (row.freight_sea_usd as number) : undefined,
    freightSea: (row.freight_sea as number) || 0,
    freightInland: (row.freight_inland as number) || 0,
    freightPort: (row.freight_port as number) || 0,
    freightMisc: (row.freight_misc as number) || 0,
    fxUsd,
    fxUsdSell: (row.fx_usd_sell as number) || fxUsd,
    fxRmb: (row.fx_rmb as number) || 195,
    fxRmbSell: (row.fx_rmb_sell as number) || ((row.fx_rmb as number) || 195),
    portFrom: (row.port_from as string) || undefined,
    portTo: (row.port_to as string) || undefined,
    dutyRate: (row.duty_rate as number) ?? 0.024,
    eprRate: (row.epr_rate as number) ?? 0,
    eprObligationRate: (row.epr_obligation_rate as number) ?? 0.20,
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
  db.prepare(`INSERT INTO estimator_cases (id,name,container_type,freight_sea_usd,freight_sea,freight_inland,freight_port,freight_misc,fx_usd,fx_usd_sell,fx_rmb,fx_rmb_sell,duty_rate,epr_rate,epr_obligation_rate,port_from,port_to,sim_mode,items_json,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, body.name || '새 케이스', body.containerType || '40ft',
      body.freightSeaUsd ?? null, body.freightSea ?? 930000,
      body.freightInland ?? 250000, body.freightPort ?? 280000, body.freightMisc ?? 0,
      body.fxUsd ?? 1430, body.fxUsdSell ?? 1380, body.fxRmb ?? 195, body.fxRmbSell ?? 195,
      body.dutyRate ?? 0.024, body.eprRate ?? 0, body.eprObligationRate ?? 0.20,
      body.portFrom ?? null, body.portTo ?? null,
      body.simMode || 'standard', JSON.stringify(body.items || []), body.notes ?? null, ts, ts);
  const row = db.prepare('SELECT * FROM estimator_cases WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: rowToCase(row) }, { status: 201 });
}
