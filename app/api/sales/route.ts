import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getNotionClient, DB, isDemoMode } from '@/lib/notion/client';
import { getSessionUser } from '@/lib/auth/session';
import { createCalendarEvent } from '@/lib/calendar-events';

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
    supplierId: (row.supplier_id as string) || undefined,
    supplierName: (row.supplier_name as string) || undefined,
    poId: (row.po_id as string) || undefined,
    poBusinessId: (row.po_business_id as string) || undefined,
  };
}

async function fetchFromNotion() {
  const salesDbId = process.env.NOTION_DB_SALES || '';
  if (!salesDbId || isDemoMode()) return [];
  try {
    const notion = getNotionClient();
    // Paginate through ALL results (newerp stores 1 page per line item)
    const allResults: any[] = [];
    let cursor: string | undefined;
    do {
      const res = await notion.databases.query({
        database_id: salesDbId,
        page_size: 100,
        start_cursor: cursor,
        sorts: [{ property: 'Date', direction: 'descending' }],
      });
      allResults.push(...res.results.filter((p: any) => p.object === 'page'));
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);

    const rows: any[] = [];
    allResults.forEach((p: any) => {
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

  // Notion → SQLite: INSERT only (never overwrite local edits)
  const localCount = (db.prepare('SELECT COUNT(*) as c FROM sales').get() as { c: number }).c;
  if (localCount === 0) {
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
  }

  const rows = db.prepare('SELECT * FROM sales ORDER BY sale_date DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToSale) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const body = await req.json();
  const db = getDb();
  const id = newId();
  const ts = now();

  const bizId = body.businessId || nextBizId('SA');

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

  db.prepare(`INSERT INTO sales (id,business_id,sale_date,customer,sale_type,salesperson,po_no,items_json,net_amount,vat,total_amount,currency,created_at,exchange_rate,misc,supplier_id,supplier_name,po_id,po_business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, bizId, body.saleDate || ts.slice(0, 10), body.customer, body.saleType || '일반', body.salesperson ?? null, body.poNo ?? null, JSON.stringify(items), netAmount, vat, totalAmount, body.currency || 'KRW', ts, rate, body.misc ?? null, body.supplierId ?? null, body.supplierName ?? null, body.poId ?? null, body.poBusinessId ?? null);

  // 마감일이 있으면 캘린더 이벤트 자동 생성
  if (body.dueDate || body.saleDate) {
    const eventDate = body.dueDate || body.saleDate;
    createCalendarEvent({
      title: `매출 마감: ${body.customer}`,
      date: eventDate,
      category: 'sale',
      relatedId: id,
      userId: user?.id || 'unknown',
      userName: user?.name || '알 수 없음',
    }).catch(() => {});
  }

  return NextResponse.json({ data: { id, businessId: bizId, saleDate: body.saleDate, customer: body.customer, saleType: body.saleType, items, netAmount, vat, totalAmount, currency: body.currency || 'KRW', createdAt: ts } }, { status: 201 });
}
