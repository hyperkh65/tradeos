import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

interface InventoryItem {
  id: string; productName: string; productCode: string;
  qty: number; location: string;
  purchasePrice?: number; currency: string;
  memo?: string; notionId?: string;
  outQty: number; remainQty: number;
  updatedAt: string; createdAt: string;
}

function dbToItem(row: Record<string, unknown>, outQty = 0): InventoryItem {
  const qty = (row.qty as number) || 0;
  return {
    id: row.id as string,
    productName: row.product_name as string,
    productCode: (row.product_code as string) || '',
    qty,
    location: (row.location as string) || '본사 창고',
    purchasePrice: row.purchase_price != null ? (row.purchase_price as number) : undefined,
    currency: (row.currency as string) || 'USD',
    memo: (row.memo as string) || undefined,
    notionId: (row.notion_id as string) || undefined,
    outQty,
    remainQty: qty - outQty,
    updatedAt: row.updated_at as string,
    createdAt: row.created_at as string,
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

export async function GET() {
  const db = getDb();
  const outMap = computeOutQty(db);
  const rows = db.prepare('SELECT * FROM inventory ORDER BY product_name ASC').all() as Record<string, unknown>[];
  const data = rows.map(r => {
    const name = ((r.product_name as string) || '').trim().toLowerCase();
    return dbToItem(r, outMap[name] || 0);
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = newId();
  const ts = now();

  db.prepare(`INSERT INTO inventory (id,product_name,product_code,qty,location,purchase_price,currency,memo,notion_id,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id, body.productName, body.productCode || '', body.qty ?? 0,
      body.location || '본사 창고',
      body.purchasePrice ?? null, body.currency || 'USD',
      body.memo ?? null, null, ts, ts
    );

  const outMap = computeOutQty(db);
  const name = (body.productName || '').trim().toLowerCase();
  return NextResponse.json({
    data: dbToItem(
      { id, product_name: body.productName, product_code: body.productCode || '', qty: body.qty ?? 0, location: body.location || '본사 창고', purchase_price: body.purchasePrice ?? null, currency: body.currency || 'USD', memo: body.memo ?? null, notion_id: null, updated_at: ts, created_at: ts },
      outMap[name] || 0
    )
  }, { status: 201 });
}
