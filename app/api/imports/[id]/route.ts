import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const row = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    db.prepare(`UPDATE imports SET broker_name=?,declaration_no=?,release_date=?,hs_code=?,duty_rate=?,duty=?,vat=?,broker_fee=?,fta_applicable=?,co_status=?,status=? WHERE id=?`)
      .run(body.brokerName ?? row.broker_name, body.declarationNo ?? row.declaration_no, body.releaseDate ?? row.release_date, body.hsCode ?? row.hs_code, body.dutyRate ?? row.duty_rate, body.duty ?? row.duty, body.vat ?? row.vat, body.brokerFee ?? row.broker_fee, (body.ftaApplicable ?? Boolean(row.fta_applicable)) ? 1 : 0, body.coStatus ?? row.co_status, body.status ?? row.status, id);

    return NextResponse.json({ data: { ...row, ...body } });
  } catch {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM imports WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
