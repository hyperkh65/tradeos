import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

function toCase(row: Record<string, unknown>) {
  return {
    id: row.id, name: row.name,
    containerType: row.container_type || '40ft',
    freightSea: row.freight_sea || 0, freightInland: row.freight_inland || 0,
    freightPort: row.freight_port || 0, freightMisc: row.freight_misc || 0,
    fxUsd: row.fx_usd || 1330, fxRmb: row.fx_rmb || 185,
    dutyRate: row.duty_rate ?? 0.024,
    simMode: row.sim_mode || 'standard',
    items: (() => { try { return JSON.parse((row.items_json as string) || '[]'); } catch { return []; } })(),
    notes: row.notes || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM estimator_cases WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });
  return NextResponse.json({ data: toCase(row) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE estimator_cases SET
    name=?, container_type=?, freight_sea=?, freight_inland=?, freight_port=?, freight_misc=?,
    fx_usd=?, fx_rmb=?, duty_rate=?, sim_mode=?, items_json=?, notes=?, updated_at=?
    WHERE id=?`).run(
    body.name, body.containerType, body.freightSea, body.freightInland, body.freightPort, body.freightMisc,
    body.fxUsd, body.fxRmb, body.dutyRate, body.simMode,
    JSON.stringify(body.items || []), body.notes ?? null, ts, id
  );
  const row = db.prepare('SELECT * FROM estimator_cases WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: toCase(row) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM estimator_cases WHERE id=?').run(id);
  return NextResponse.json({ success: true });
}
