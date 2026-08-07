import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM claims WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    db.prepare(`UPDATE claims SET issue_type=?,description=?,claim_amount=?,currency=?,compensation_type=?,compensation_amount=?,status=?,updated_at=? WHERE id=?`)
      .run(body.issueType ?? row.issue_type, body.description ?? row.description, body.claimAmount ?? row.claim_amount, body.currency ?? row.currency, body.compensationType ?? row.compensation_type, body.compensationAmount ?? row.compensation_amount, body.status ?? row.status, ts, id);

    return NextResponse.json({ data: { ...row, ...body, updatedAt: ts } });
  } catch {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM claims WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
