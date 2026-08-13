import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { dbToShipment } from '../route';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM shipments WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const cargoItems = body.cargoItems !== undefined ? body.cargoItems : JSON.parse((row.cargo_items_json as string) || '[]');
    const poIds = body.poIds !== undefined ? body.poIds
      : cargoItems.map((i: { poId?: string }) => i.poId).filter(Boolean);

    db.prepare(`UPDATE shipments SET
      type=?,forwarder_name=?,origin=?,pol=?,pod=?,etd=?,eta=?,vessel=?,voyage=?,
      bl_no=?,container_no=?,cbm=?,gross_weight=?,freight_cost=?,freight_currency=?,
      packing_list_url=?,cargo_items_json=?,po_ids_json=?,status=?,updated_at=?
      WHERE id=?`)
      .run(
        body.type ?? row.type,
        body.forwarderName ?? row.forwarder_name,
        body.origin ?? row.origin,
        body.pol ?? row.pol,
        body.pod ?? row.pod,
        body.etd ?? row.etd,
        body.eta ?? row.eta,
        body.vessel ?? row.vessel,
        body.voyage ?? row.voyage,
        body.blNo ?? row.bl_no,
        body.containerNo ?? row.container_no,
        body.cbm ?? row.cbm,
        body.grossWeight ?? row.gross_weight,
        body.freightCost ?? row.freight_cost,
        body.freightCurrency ?? row.freight_currency ?? 'USD',
        body.packingListUrl ?? row.packing_list_url,
        JSON.stringify(cargoItems),
        JSON.stringify(poIds),
        body.status ?? row.status,
        ts, id,
      );

    const updated = db.prepare('SELECT * FROM shipments WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToShipment(updated) });
  } catch (e) {
    console.error('[shipments PUT]', e);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM shipments WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
