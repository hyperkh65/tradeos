import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM inspections WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const checkedQty = body.checkedQty ?? row.checked_qty;
    const passedQty = body.passedQty ?? row.passed_qty;
    const failedQty = body.failedQty ?? row.failed_qty;
    const defectRate = (checkedQty && failedQty) ? Number(((failedQty / checkedQty) * 100).toFixed(2)) : (row.defect_rate ?? null);

    db.prepare(`UPDATE inspections SET inspection_date=?,inspector=?,inspection_type=?,sample_qty=?,checked_qty=?,passed_qty=?,failed_qty=?,defect_rate=?,result=?,summary=?,status=? WHERE id=?`)
      .run(body.inspectionDate ?? row.inspection_date, body.inspector ?? row.inspector, body.inspectionType ?? row.inspection_type, body.sampleQty ?? row.sample_qty, checkedQty, passedQty, failedQty, defectRate, body.result ?? row.result, body.summary ?? row.summary, body.status ?? row.status, id);

    return NextResponse.json({ data: { ...row, ...body, defectRate, updatedAt: ts } });
  } catch {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM inspections WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
