import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getNotionClient, DB, isDemoMode } from '@/lib/notion/client';

// Notion property mapping (existing 재고관리 DB)
// 이름(title) = 표시명, ProductName(rich_text) = 제품명, ProductCode(rich_text) = 품번
// Qty(number), Warehouse(rich_text) = 위치, Cost(number) = 매입단가
// Currency(select), ExchangeRate(number), notes(rich_text) = 메모

interface InventoryRow {
  id: string; product_name: string; product_code: string;
  qty: number; location: string;
  purchase_price: number | null; currency: string; exchange_rate: number;
  memo: string | null; notion_id: string | null;
  updated_at: string; created_at: string;
}

interface InventoryItem {
  id: string; productName: string; productCode: string;
  qty: number; location: string;
  unitPrice?: number; currency: string; exchangeRate: number;
  remainValue?: number; memo?: string; notionId?: string;
  outQty: number; remainQty: number;
  updatedAt: string; createdAt: string;
}

function rowToItem(row: InventoryRow, outQty = 0): InventoryItem {
  const qty = row.qty || 0;
  const unitPrice = row.purchase_price ?? undefined;
  const exchangeRate = row.exchange_rate || 1;
  const remainQty = qty - outQty;
  const remainValue = unitPrice != null ? Math.round(remainQty * unitPrice * exchangeRate) : undefined;
  return {
    id: row.id, productName: row.product_name, productCode: row.product_code || '',
    qty, location: row.location || '본사 창고',
    unitPrice, currency: row.currency || 'USD', exchangeRate, remainValue,
    memo: row.memo || undefined, notionId: row.notion_id || undefined,
    outQty, remainQty,
    updatedAt: row.updated_at, createdAt: row.created_at,
  };
}

function computeOutQty(db: ReturnType<typeof getDb>): Record<string, number> {
  try {
    const sales = db.prepare('SELECT items_json FROM sales').all() as { items_json: string }[];
    const outMap: Record<string, number> = {};
    for (const s of sales) {
      try {
        const items = JSON.parse(s.items_json || '[]');
        for (const item of items) {
          const name = (item.product || item.productName || item.name || '').trim().toLowerCase();
          if (!name) continue;
          outMap[name] = (outMap[name] || 0) + (item.qty || 0);
        }
      } catch { /* skip */ }
    }
    return outMap;
  } catch { return {}; }
}

function notionPageToRow(p: any): InventoryRow {
  const pr = p.properties;
  const txt = (k: string) => pr[k]?.rich_text?.[0]?.plain_text || pr[k]?.title?.[0]?.plain_text || '';
  const num = (k: string) => pr[k]?.number ?? null;
  const sel = (k: string) => pr[k]?.select?.name || '';
  const productName = txt('ProductName') || txt('이름') || '(미입력)';
  return {
    id: p.id,
    product_name: productName,
    product_code: txt('ProductCode'),
    qty: num('Qty') ?? 0,
    location: txt('Warehouse') || '본사 창고',
    purchase_price: num('Cost'),
    currency: sel('Currency') || 'USD',
    exchange_rate: num('ExchangeRate') ?? 1,
    memo: txt('notes') || null,
    notion_id: p.id,
    updated_at: p.last_edited_time,
    created_at: p.created_time,
  };
}

async function fetchFromNotion(): Promise<InventoryRow[]> {
  const dbId = DB.inventory;
  if (!dbId || isDemoMode()) return [];
  try {
    const notion = getNotionClient();
    const all: any[] = [];
    let cursor: string | undefined;
    do {
      const res = await notion.databases.query({ database_id: dbId, page_size: 100, start_cursor: cursor });
      all.push(...res.results.filter((p: any) => p.object === 'page' && !p.archived));
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);
    return all.map(notionPageToRow);
  } catch (e) {
    console.error('[Inventory] Notion read error:', e);
    return [];
  }
}

function notionProps(body: { productName: string; productCode?: string; qty: number; location?: string; unitPrice?: number | null; currency?: string; exchangeRate?: number; memo?: string }) {
  return {
    '이름': { title: [{ text: { content: body.productName || '' } }] },
    'ProductName': { rich_text: [{ text: { content: body.productName || '' } }] },
    'ProductCode': { rich_text: [{ text: { content: body.productCode || '' } }] },
    'Qty': { number: body.qty ?? 0 },
    'Warehouse': { rich_text: [{ text: { content: body.location || '본사 창고' } }] },
    'Cost': { number: body.unitPrice ?? null },
    'Currency': { select: body.currency ? { name: body.currency } : null },
    'ExchangeRate': { number: body.exchangeRate ?? 1 },
    'notes': { rich_text: [{ text: { content: body.memo || '' } }] },
  };
}

export async function GET() {
  const db = getDb();
  const outMap = computeOutQty(db);

  const notionRows = await fetchFromNotion();
  if (notionRows.length > 0) {
    const upsert = db.prepare(`INSERT OR REPLACE INTO inventory
      (id,product_name,product_code,qty,location,purchase_price,currency,exchange_rate,memo,notion_id,updated_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const r of notionRows) {
        upsert.run(r.id, r.product_name, r.product_code, r.qty, r.location,
          r.purchase_price, r.currency, r.exchange_rate, r.memo, r.notion_id, r.updated_at, r.created_at);
      }
    })();
    const key = (name: string) => name.trim().toLowerCase();
    return NextResponse.json({ data: notionRows.map(r => rowToItem(r, outMap[key(r.product_name)] || 0)) });
  }

  const rows = db.prepare('SELECT * FROM inventory ORDER BY product_name ASC').all() as InventoryRow[];
  return NextResponse.json({ data: rows.map(r => rowToItem(r, outMap[r.product_name.trim().toLowerCase()] || 0)) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = newId();
  const ts = now();

  let notionId: string | null = null;
  const dbId = DB.inventory;
  if (dbId && !isDemoMode()) {
    try {
      const page = await getNotionClient().pages.create({
        parent: { database_id: dbId },
        properties: notionProps(body) as any,
      });
      notionId = page.id;
    } catch (e) {
      console.error('[Inventory] Notion create error:', e);
    }
  }

  const rowId = notionId || id;
  db.prepare(`INSERT OR REPLACE INTO inventory
    (id,product_name,product_code,qty,location,purchase_price,currency,exchange_rate,memo,notion_id,updated_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(rowId, body.productName, body.productCode || '', body.qty ?? 0,
      body.location || '본사 창고', body.unitPrice ?? null, body.currency || 'USD',
      body.exchangeRate ?? 1, body.memo ?? null, notionId, ts, ts);

  const outMap = computeOutQty(db);
  const row: InventoryRow = {
    id: rowId, product_name: body.productName, product_code: body.productCode || '',
    qty: body.qty ?? 0, location: body.location || '본사 창고',
    purchase_price: body.unitPrice ?? null, currency: body.currency || 'USD',
    exchange_rate: body.exchangeRate ?? 1, memo: body.memo ?? null,
    notion_id: notionId, updated_at: ts, created_at: ts,
  };
  return NextResponse.json({ data: rowToItem(row, outMap[(body.productName || '').trim().toLowerCase()] || 0) }, { status: 201 });
}
