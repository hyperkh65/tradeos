import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getNotionClient, DB, isDemoMode } from '@/lib/notion/client';

function dbToSale(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id,
    saleDate: row.sale_date, customer: row.customer,
    saleType: row.sale_type, salesperson: row.salesperson || undefined,
    poNo: row.po_no || undefined,
    items: JSON.parse(row.items_json as string || '[]'),
    netAmount: row.net_amount, vat: row.vat, totalAmount: row.total_amount,
    currency: row.currency, createdAt: row.created_at,
    exchangeRate: (row.exchange_rate as number) ?? 1,
    misc: (row.misc as string) || undefined,
  };
}

async function fetchFromNotion() {
  const dbId = DB.projects ?? '';  // DB_SALES not in client.ts, use custom env
  const salesDbId = process.env.NOTION_DB_SALES || '';
  if (!salesDbId || isDemoMode()) return [];
  try {
    const notion = getNotionClient();
    const res = await notion.databases.query({ database_id: salesDbId, page_size: 200,
      sorts: [{ property: 'Date', direction: 'descending' }] });
    const rows: any[] = [];
    res.results.filter(p => p.object === 'page').forEach((p: any) => {
      const props = p.properties;
      const getText = (key: string) => props[key]?.rich_text?.[0]?.plain_text || props[key]?.title?.[0]?.plain_text || '';
      const getNum = (key: string) => props[key]?.number ?? 0;
      const getSel = (key: string) => props[key]?.select?.name || '';
      const getDate = (key: string) => props[key]?.date?.start || '';
      rows.push({
        pageId: p.id,
        code: getText('code'),
        date: getDate('Date'),
        customer: getText('Customer'),
        saleType: getSel('SaleType') || '일반',
        salesperson: getText('Salesperson'),
        poNo: getText('PoNo'),
        product: getText('Items'),
        specification: getText('Specification'),
        qty: getNum('Quantity'),
        unitPrice: getNum('UnitPrice'),
        amount: getNum('Total'),
      });
    });

    // Group by code
    const grouped: Record<string, any> = {};
    for (const row of rows) {
      const key = row.code || row.pageId;
      if (!grouped[key]) {
        grouped[key] = { code: row.code, date: row.date, customer: row.customer,
          saleType: row.saleType, salesperson: row.salesperson, poNo: row.poNo, items: [], firstPageId: row.pageId };
      }
      if (row.product) grouped[key].items.push({ product: row.product, specification: row.specification, qty: row.qty, unitPrice: row.unitPrice, amount: row.amount });
    }

    return Object.values(grouped).map(g => {
      const netAmount = g.items.reduce((s: number, i: any) => s + (i.amount || 0), 0);
      return { id: g.firstPageId, businessId: g.code, saleDate: g.date, customer: g.customer, saleType: g.saleType, salesperson: g.salesperson, poNo: g.poNo, items: g.items, netAmount, vat: Math.round(netAmount * 0.1), totalAmount: Math.round(netAmount * 1.1), currency: 'KRW', createdAt: new Date().toISOString() };
    });
  } catch (e) {
    console.error('[Sales] Notion error:', e);
    return [];
  }
}

export async function GET() {
  const db = getDb();

  try {
    const notionSales = await fetchFromNotion();
    if (notionSales.length > 0) {
      db.transaction(() => {
        for (const s of notionSales) {
          db.prepare(`INSERT OR IGNORE INTO sales (id,business_id,sale_date,customer,sale_type,salesperson,po_no,items_json,net_amount,vat,total_amount,currency,created_at,exchange_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(s.id, s.businessId, s.saleDate, s.customer, s.saleType, s.salesperson ?? null, s.poNo ?? null, JSON.stringify(s.items), s.netAmount, s.vat, s.totalAmount, s.currency, s.createdAt, 1);
        }
      })();
    }
  } catch (e) {
    console.error('[Sales] Notion fetch error:', e);
  }

  const rows = db.prepare('SELECT * FROM sales ORDER BY sale_date DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToSale) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = newId();
  const ts = now();

  const lastRow = db.prepare(`SELECT business_id FROM sales WHERE business_id LIKE 'SA-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
  const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g, '') || '0') : 0;
  const year = new Date().getFullYear();
  const bizId = body.businessId || `SA-${year}-${String(lastNum + 1).padStart(4, '0')}`;

  const items = body.items || [];
  const rate = Number(body.exchangeRate) || 1;
  const netAmount = items.reduce((s: number, i: any) => s + (i.amount || 0), 0);
  const netKRW = rate === 1 ? netAmount : Math.round(netAmount * rate);
  const vat = Math.round(netKRW * 0.1);
  const totalAmount = netKRW + vat;

  // Save to Notion DB_SALES
  const salesDbId = process.env.NOTION_DB_SALES || '';
  if (salesDbId && !isDemoMode()) {
    try {
      const notion = getNotionClient();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await notion.pages.create({
          parent: { database_id: salesDbId },
          properties: {
            'Name': { title: [{ text: { content: `${bizId}_${i + 1}` } }] },
            'code': { rich_text: [{ text: { content: bizId } }] },
            'Date': { date: { start: body.saleDate || ts.slice(0, 10) } },
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
    } catch (e) { console.error('[Sales] Notion create error:', e); }
  }

  db.prepare(`INSERT INTO sales (id,business_id,sale_date,customer,sale_type,salesperson,po_no,items_json,net_amount,vat,total_amount,currency,created_at,exchange_rate,misc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, bizId, body.saleDate || ts.slice(0, 10), body.customer, body.saleType || '일반', body.salesperson ?? null, body.poNo ?? null, JSON.stringify(items), netAmount, vat, totalAmount, body.currency || 'KRW', ts, rate, body.misc ?? null);

  return NextResponse.json({ data: { id, businessId: bizId, saleDate: body.saleDate, customer: body.customer, saleType: body.saleType, items, netAmount, vat, totalAmount, currency: body.currency || 'KRW', createdAt: ts } }, { status: 201 });
}
