import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { updateNotionQuote, deleteNotionQuote } from '@/lib/notion/mapper';
import { dbToQuote } from '../route';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM quotes WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const items = (body.items ?? JSON.parse((row.items_json as string) || '[]')).map((it: any) => ({
      ...it,
      amount: it.amount ?? (it.quantity ?? 0) * (it.unitPrice ?? 0),
    }));
    const totalAmount = items.reduce((s: number, it: any) => s + (it.amount || 0), 0);
    const companyName = body.companyName ?? row.company_name;
    const currency = body.currency ?? row.currency;
    const businessId = row.business_id as string;

    const prevHistory: any[] = JSON.parse((row.history_json as string) || '[]');
    const newHistory = [...prevHistory, { at: ts, by: body.updatedByName || 'user-1', action: '수정' }];

    db.prepare(`UPDATE quotes SET
      type=?, company_id=?, company_name=?, items_json=?, currency=?, incoterm=?,
      payment_terms=?, validity=?, status=?, remark=?, quote_date=?,
      total_amount=?, updated_at=?, updated_by=?, images_json=?, history_json=?,
      doc_type=?, special_notes=?, general_info=?
      WHERE id=?`)
      .run(
        body.type ?? row.type, body.companyId ?? row.company_id, companyName,
        JSON.stringify(items), currency, body.incoterm ?? null,
        body.paymentTerms ?? null, body.validity ?? null, body.status ?? row.status,
        body.remark ?? null, body.quoteDate ?? row.quote_date,
        totalAmount, ts, body.updatedByName ?? null,
        body.imagesJson ?? row.images_json ?? null,
        JSON.stringify(newHistory),
        body.docType ?? row.doc_type ?? 'QUOTE',
        body.specialNotes ?? row.special_notes ?? null,
        body.generalInfo ?? row.general_info ?? null,
        id,
      );

    updateNotionQuote(businessId, {
      id, businessId,
      type: (body.type ?? row.type) as 'customer' | 'supplier',
      companyId: body.companyId ?? (row.company_id as string) ?? '',
      companyName, items, currency,
      incoterm: body.incoterm ?? (row.incoterm as string) ?? undefined,
      remark: body.remark ?? (row.remark as string) ?? undefined,
      status: (body.status ?? row.status) as import('@/types').Quote['status'],
      createdBy: (row.created_by as string) || 'user-1',
      createdAt: row.created_at as string,
      quoteDate: body.quoteDate ?? (row.quote_date as string) ?? undefined,
      specialNotes: body.specialNotes ?? (row.special_notes as string) ?? undefined,
      generalInfo: body.generalInfo ?? (row.general_info as string) ?? undefined,
    }).catch(() => {});

    const updated = db.prepare('SELECT * FROM quotes WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToQuote(updated) });
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
      deleteNotionQuote(row.business_id).catch(() => {});
    }
    db.prepare('DELETE FROM quotes WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
