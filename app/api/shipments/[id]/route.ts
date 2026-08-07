import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM shipments WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    db.prepare(`UPDATE shipments SET type=?,forwarder_name=?,origin=?,pol=?,pod=?,etd=?,eta=?,vessel=?,voyage=?,bl_no=?,cbm=?,gross_weight=?,po_ids_json=?,status=?,updated_at=? WHERE id=?`)
      .run(body.type ?? row.type, body.forwarderName ?? row.forwarder_name, body.origin ?? row.origin, body.pol ?? row.pol, body.pod ?? row.pod, body.etd ?? row.etd, body.eta ?? row.eta, body.vessel ?? row.vessel, body.voyage ?? row.voyage, body.blNo ?? row.bl_no, body.cbm ?? row.cbm, body.grossWeight ?? row.gross_weight, JSON.stringify(body.poIds ?? JSON.parse(row.po_ids_json as string || '[]')), body.status ?? row.status, ts, id);

    return NextResponse.json({ data: { ...row, ...body, updatedAt: ts } });
  } catch {
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
