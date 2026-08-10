import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getNotionClient, DB, isDemoMode } from '@/lib/notion/client';

interface InventoryItem {
  id: string; productName: string; productCode: string;
  qty: number; location: string; memo?: string; notionId?: string;
  updatedAt: string; createdAt: string;
}

function dbToItem(row: Record<string, unknown>): InventoryItem {
  return {
    id: row.id as string,
    productName: row.product_name as string,
    productCode: (row.product_code as string) || '',
    qty: (row.qty as number) || 0,
    location: (row.location as string) || '본사 창고',
    memo: (row.memo as string) || undefined,
    notionId: (row.notion_id as string) || undefined,
    updatedAt: row.updated_at as string,
    createdAt: row.created_at as string,
  };
}

async function fetchFromNotion(): Promise<InventoryItem[]> {
  const dbId = DB.inventory ?? (process.env.NOTION_DB_INVENTORY || '');
  if (!dbId || isDemoMode()) return [];
  try {
    const notion = getNotionClient();
    const res = await notion.databases.query({ database_id: dbId, page_size: 200 });
    return res.results
      .filter(p => p.object === 'page')
      .map((p: any) => {
        const props = p.properties;
        const getText = (key: string) => props[key]?.rich_text?.[0]?.plain_text || props[key]?.title?.[0]?.plain_text || '';
        const getNum = (key: string) => props[key]?.number ?? 0;
        const getSel = (key: string) => props[key]?.select?.name || '';
        return {
          id: p.id,
          productName: getText('ProductName') || props['ProductName']?.title?.[0]?.plain_text || '',
          productCode: getText('ProductCode'),
          qty: getNum('Qty'),
          location: getSel('Location') || getText('Location') || '본사 창고',
          notionId: p.id,
          updatedAt: p.last_edited_time,
          createdAt: p.created_time,
        };
      });
  } catch (e) {
    console.error('[Inventory] Notion error:', e);
    return [];
  }
}

export async function GET() {
  const db = getDb();
  const ts = now();

  try {
    const items = await fetchFromNotion();
    if (items.length > 0) {
      db.transaction(() => {
        for (const item of items) {
          db.prepare(`INSERT OR REPLACE INTO inventory (id,product_name,product_code,qty,location,notion_id,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?)`)
            .run(item.id, item.productName, item.productCode, item.qty, item.location, item.notionId ?? null, item.updatedAt, item.createdAt || ts);
        }
      })();
      return NextResponse.json({ data: items });
    }
  } catch (e) {
    console.error('[Inventory] Notion fetch error:', e);
  }

  const rows = db.prepare('SELECT * FROM inventory ORDER BY product_name ASC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToItem) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = newId();
  const ts = now();

  // Save to Notion
  let notionId: string | null = null;
  const dbId = DB.inventory ?? (process.env.NOTION_DB_INVENTORY || '');
  if (dbId && !isDemoMode()) {
    try {
      const notion = getNotionClient();
      const page = await notion.pages.create({
        parent: { database_id: dbId },
        properties: {
          'ProductName': { title: [{ text: { content: body.productName || '' } }] },
          'ProductCode': { rich_text: [{ text: { content: body.productCode || '' } }] },
          'Qty': { number: body.qty ?? 0 },
          'Location': { select: { name: body.location || '본사 창고' } },
        },
      });
      notionId = page.id;
    } catch (e) { console.error('[Inventory] Notion create error:', e); }
  }

  db.prepare(`INSERT INTO inventory (id,product_name,product_code,qty,location,memo,notion_id,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, body.productName, body.productCode || '', body.qty ?? 0, body.location || '본사 창고', body.memo ?? null, notionId, ts, ts);

  return NextResponse.json({ data: dbToItem({ id, product_name: body.productName, product_code: body.productCode || '', qty: body.qty ?? 0, location: body.location || '본사 창고', memo: body.memo ?? null, notion_id: notionId, updated_at: ts, created_at: ts }) }, { status: 201 });
}
