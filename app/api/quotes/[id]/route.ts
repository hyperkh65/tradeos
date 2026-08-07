import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM quotes WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    db.prepare(`UPDATE quotes SET type=?,company_id=?,company_name=?,items_json=?,currency=?,incoterm=?,payment_terms=?,validity=?,status=?,remark=? WHERE id=?`)
      .run(body.type ?? row.type, body.companyId ?? row.company_id, body.companyName ?? row.company_name, JSON.stringify(body.items ?? JSON.parse(row.items_json as string || '[]')), body.currency ?? row.currency, body.incoterm ?? null, body.paymentTerms ?? null, body.validity ?? null, body.status ?? row.status, body.remark ?? null, id);

    return NextResponse.json({ data: { ...row, ...body, updatedAt: ts } });
  } catch {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM quotes WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
