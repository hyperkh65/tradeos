import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getNotionClient, isDemoMode } from '@/lib/notion/client';
import { syncIndexOnWrite, syncIndexOnDelete } from '@/lib/ai/sync';

async function syncSaleToNotion(bizId: string, items: any[], body: any) {
  const salesDbId = process.env.NOTION_DB_SALES || '';
  if (!salesDbId || isDemoMode()) return;
  try {
    const notion = getNotionClient();
    // Archive old pages with same code
    const res = await notion.databases.query({
      database_id: salesDbId,
      filter: { property: 'code', rich_text: { equals: bizId } },
    });
    await Promise.all(res.results.map(p => notion.pages.update({ page_id: p.id, archived: true }).catch(() => {})));
    // Create new pages per item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await notion.pages.create({
        parent: { database_id: salesDbId },
        properties: {
          'Name': { title: [{ text: { content: `${bizId}_${i + 1}` } }] },
          'code': { rich_text: [{ text: { content: bizId } }] },
          'Date': { date: { start: body.saleDate } },
          'Customer': { rich_text: [{ text: { content: body.customer || '' } }] },
          'Items': { rich_text: [{ text: { content: item.product || '' } }] },
          'Specification': { rich_text: [{ text: { content: item.specification || '' } }] },
          'SaleType': { select: { name: body.saleType || '일반' } },
          'Quantity': { number: item.qty || 0 },
          'UnitPrice': { number: item.unitPrice || 0 },
          'Total': { number: item.amount || 0 },
          'Salesperson': { rich_text: [{ text: { content: body.salesperson || '' } }] },
          'PoNo': { rich_text: [{ text: { content: body.poNo || '' } }] },
        },
      });
    }
  } catch (e) { console.error('[Sales] Notion sync error:', e); }
}

async function archiveSaleFromNotion(bizId: string) {
  const salesDbId = process.env.NOTION_DB_SALES || '';
  if (!salesDbId || isDemoMode()) return;
  try {
    const notion = getNotionClient();
    const res = await notion.databases.query({
      database_id: salesDbId,
      filter: { property: 'code', rich_text: { equals: bizId } },
    });
    await Promise.all(res.results.map(p => notion.pages.update({ page_id: p.id, archived: true }).catch(() => {})));
  } catch (e) { console.error('[Sales] Notion archive error:', e); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const items = body.items || [];
  const rate = Number(body.exchangeRate) || 1;
  const netAmount = items.reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const netKRW = rate === 1 ? netAmount : Math.round(netAmount * rate);
  const vat = Math.round(netKRW * 0.1);
  db.prepare(`UPDATE sales SET customer=?,sale_date=?,sale_type=?,salesperson=?,po_no=?,items_json=?,net_amount=?,vat=?,total_amount=?,currency=?,exchange_rate=?,misc=?,supplier_id=?,supplier_name=?,po_id=?,po_business_id=? WHERE id=?`)
    .run(body.customer, body.saleDate, body.saleType || '일반', body.salesperson ?? null, body.poNo ?? null, JSON.stringify(items), netAmount, vat, netKRW + vat, body.currency || 'KRW', rate, body.misc ?? null, body.supplierId ?? null, body.supplierName ?? null, body.poId ?? null, body.poBusinessId ?? null, id);
  // Sync to Notion
  const row = db.prepare('SELECT business_id FROM sales WHERE id=?').get(id) as { business_id: string } | undefined;
  if (row?.business_id) syncSaleToNotion(row.business_id, items, body).catch(() => {});
  syncIndexOnWrite('sale', id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT business_id FROM sales WHERE id=?').get(id) as { business_id: string } | undefined;
  db.prepare('DELETE FROM sales WHERE id=?').run(id);
  if (row?.business_id) archiveSaleFromNotion(row.business_id).catch(() => {});
  syncIndexOnDelete('sale', id);
  return NextResponse.json({ ok: true });
}
