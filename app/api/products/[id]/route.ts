import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { updateNotionPage, productToNotion, archiveNotionPage } from '@/lib/notion/mapper';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM products WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    db.prepare(`UPDATE products SET code=?,name_ko=?,name_en=?,category=?,supplier_name=?,status=?,purchase_price=?,selling_price=?,currency=?,moq=?,lead_time_days=?,hs_code=?,country_of_origin=?,updated_at=? WHERE id=?`)
      .run(body.code ?? row.code, body.nameKo ?? row.name_ko, body.nameEn ?? null, body.category ?? null, body.supplierName ?? null, body.status ?? row.status, body.purchasePrice ?? null, body.sellingPrice ?? null, body.currency ?? row.currency, body.moq ?? null, body.leadTimeDays ?? null, body.hsCode ?? null, body.countryOfOrigin ?? null, ts, id);

    if (row.notion_id) {
      updateNotionPage(row.notion_id as string, productToNotion(body)).catch(() => {});
    }

    return NextResponse.json({ data: { ...row, ...body, updatedAt: ts } });
  } catch {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT notion_id FROM products WHERE id=?').get(id) as { notion_id: string } | undefined;
    db.prepare('DELETE FROM products WHERE id=?').run(id);
    if (row?.notion_id) archiveNotionPage(row.notion_id).catch(() => {});
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
