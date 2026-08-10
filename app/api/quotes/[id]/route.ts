import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { updateNotionQuote, deleteNotionQuote } from '@/lib/notion/mapper';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM quotes WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const items = body.items ?? JSON.parse(row.items_json as string || '[]');
    const companyName = body.companyName ?? row.company_name;
    const currency = body.currency ?? row.currency;
    const businessId = row.business_id as string;

    db.prepare(`UPDATE quotes SET type=?,company_id=?,company_name=?,items_json=?,currency=?,incoterm=?,payment_terms=?,validity=?,status=?,remark=? WHERE id=?`)
      .run(body.type ?? row.type, body.companyId ?? row.company_id, companyName,
        JSON.stringify(items), currency, body.incoterm ?? null,
        body.paymentTerms ?? null, body.validity ?? null, body.status ?? row.status,
        body.remark ?? null, id);

    // Sync to Notion (ERP)
    await updateNotionQuote(businessId, {
      id, businessId,
      type: (body.type ?? row.type) as 'customer' | 'supplier',
      companyId: body.companyId ?? (row.company_id as string) ?? '',
      companyName, items, currency,
      incoterm: body.incoterm, remark: body.remark,
      status: (body.status ?? row.status) as import('@/types').Quote['status'],
      createdBy: (row.created_by as string) || 'user-1',
      createdAt: row.created_at as string,
    }).catch(e => console.error('[Quote] Notion update error:', e));

    return NextResponse.json({ data: { ...row, ...body, updatedAt: ts } });
  } catch {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    const row = db.prepare('SELECT business_id FROM quotes WHERE id=?').get(id) as { business_id: string } | undefined;
    if (row?.business_id) {
      await deleteNotionQuote(row.business_id).catch(e => console.error('[Quote] Notion delete error:', e));
    }

    db.prepare('DELETE FROM quotes WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
