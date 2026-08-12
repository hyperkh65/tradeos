import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { fetchNotionPurchaseOrders, createNotionPurchaseOrder } from '@/lib/notion/mapper';
import type { PurchaseOrder } from '@/types';

function dbToPO(row: Record<string, unknown>): PurchaseOrder & { imagesJson?: string; depositRatio?: string } {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    supplierId: (row.supplier_id as string) || '',
    supplierName: row.supplier_name as string,
    items: JSON.parse(row.items_json as string || '[]'),
    currency: ((row.currency as string) || 'USD').replace(/^RMB$/i, 'CNY'),
    totalAmount: row.total_amount as number,
    depositAmount: (row.deposit_amount as number) || undefined,
    balanceAmount: (row.balance_amount as number) || undefined,
    paymentTerms: (row.payment_terms as string) || undefined,
    orderDate: row.order_date as string,
    productionDueDate: (row.production_due_date as string) || undefined,
    inspectionDate: (row.inspection_date as string) || undefined,
    etd: (row.etd as string) || undefined,
    status: (row.status as PurchaseOrder['status']) || 'draft',
    incoterm: (row.incoterm as string) || undefined,
    remark: (row.remark as string) || undefined,
    createdBy: (row.created_by as string) || 'user-1',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    imagesJson: (row.images_json as string) || undefined,
    depositRatio: (row.deposit_ratio as string) || '30',
  };
}

function poToDb(db: ReturnType<typeof getDb>, po: PurchaseOrder & { imagesJson?: string; depositRatio?: string }, id: string, ts: string, notionId?: string | null) {
  db.prepare(`INSERT OR IGNORE INTO purchase_orders
    (id,business_id,supplier_id,supplier_name,items_json,currency,total_amount,deposit_amount,balance_amount,payment_terms,order_date,production_due_date,inspection_date,etd,status,incoterm,remark,created_by,notion_id,created_at,updated_at,images_json,deposit_ratio)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id, po.businessId, po.supplierId || '', po.supplierName,
      JSON.stringify(po.items), po.currency, po.totalAmount,
      po.depositAmount ?? null, po.balanceAmount ?? null, po.paymentTerms ?? null,
      po.orderDate, po.productionDueDate ?? null, po.inspectionDate ?? null,
      po.etd ?? null, po.status || 'confirmed', po.incoterm ?? null, po.remark ?? null,
      po.createdBy || 'ynk-erp', notionId ?? null, po.createdAt || ts, ts,
      (po as any).imagesJson ?? null, (po as any).depositRatio ?? '30',
    );
}

export async function GET() {
  const db = getDb();
  const ts = now();

  try {
    // Sync Notion (ERP) → SQLite (INSERT OR IGNORE keeps local edits)
    const notionPOs = await fetchNotionPurchaseOrders();
    if (notionPOs.length > 0) {
      db.transaction(() => {
        for (const po of notionPOs) {
          poToDb(db, po, po.id, ts, po.id);
        }
      })();
    }
  } catch (e) {
    console.error('[PO] Notion fetch error:', e);
  }

  // Always return SQLite data (preserves local edits for ETD/status/etc)
  const rows = db.prepare('SELECT * FROM purchase_orders ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToPO) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM purchase_orders WHERE business_id LIKE 'PO-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g, '') || '0') : 0;
    const year = new Date().getFullYear();
    const bizId = body.businessId || `PO-${year}-${String(lastNum + 1).padStart(4, '0')}`;

    const items = body.items || [];
    const total = items.reduce((s: number, i: { amount: number }) => s + (i.amount || 0), 0);

    const po: PurchaseOrder & { imagesJson?: string; depositRatio?: string } = {
      id, businessId: bizId,
      supplierId: body.supplierId || '',
      supplierName: body.supplierName || '',
      items, currency: body.currency || 'USD',
      totalAmount: total,
      depositAmount: body.depositAmount,
      balanceAmount: body.balanceAmount,
      paymentTerms: body.paymentTerms,
      orderDate: body.orderDate || ts.slice(0, 10),
      productionDueDate: body.productionDueDate,
      inspectionDate: body.inspectionDate,
      etd: body.etd,
      status: body.status || 'draft',
      incoterm: body.incoterm,
      remark: body.remark,
      createdBy: 'user-1',
      createdAt: ts, updatedAt: ts,
      imagesJson: body.imagesJson ?? null,
      depositRatio: body.depositRatio ?? '30',
    };

    // Save to Notion (ERP)
    const notionId = await createNotionPurchaseOrder(po).catch(() => null);

    // Save to SQLite
    poToDb(db, po, id, ts, notionId);

    return NextResponse.json({ data: po }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
