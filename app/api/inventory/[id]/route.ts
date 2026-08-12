import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getNotionClient, DB, isDemoMode } from '@/lib/notion/client';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const ts = now();

  db.prepare(`UPDATE inventory SET product_name=?,product_code=?,qty=?,location=?,purchase_price=?,currency=?,exchange_rate=?,memo=?,updated_at=? WHERE id=?`)
    .run(body.productName, body.productCode || '', body.qty ?? 0, body.location || '본사 창고',
      body.unitPrice ?? null, body.currency || 'USD', body.exchangeRate ?? 1, body.memo ?? null, ts, id);

  // Sync to Notion
  const dbId = DB.inventory;
  if (dbId && !isDemoMode()) {
    try {
      const row = db.prepare('SELECT notion_id FROM inventory WHERE id=?').get(id) as { notion_id: string | null } | undefined;
      const notionId = row?.notion_id || id;
      await getNotionClient().pages.update({
        page_id: notionId,
        properties: {
          'ProductName': { title: [{ text: { content: body.productName || '' } }] },
          'ProductCode': { rich_text: [{ text: { content: body.productCode || '' } }] },
          'Qty': { number: body.qty ?? 0 },
          'Location': { select: { name: body.location || '본사 창고' } },
          'UnitPrice': body.unitPrice != null ? { number: body.unitPrice } : { number: null },
          'Currency': { select: { name: body.currency || 'USD' } },
          'ExchangeRate': { number: body.exchangeRate ?? 1 },
          'Memo': { rich_text: [{ text: { content: body.memo || '' } }] },
        },
      });
    } catch (e) {
      console.error('[Inventory] Notion update error:', e);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  // Archive in Notion (set archived)
  const dbId = DB.inventory;
  if (dbId && !isDemoMode()) {
    try {
      const row = db.prepare('SELECT notion_id FROM inventory WHERE id=?').get(id) as { notion_id: string | null } | undefined;
      const notionId = row?.notion_id || id;
      await getNotionClient().pages.update({ page_id: notionId, archived: true });
    } catch (e) {
      console.error('[Inventory] Notion archive error:', e);
    }
  }

  db.prepare('DELETE FROM inventory WHERE id=?').run(id);
  return NextResponse.json({ ok: true });
}
