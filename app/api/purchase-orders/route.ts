import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { fetchNotionPurchaseOrders, createNotionPurchaseOrder } from '@/lib/notion/mapper';
import type { PurchaseOrder } from '@/types';
import { createCalendarEvent } from '@/lib/calendar-events';

function dbToPO(row: Record<string, unknown>): PurchaseOrder & { imagesJson?: string; depositRatio?: string; revisionsJson?: string } {
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
    revisionsJson: (row.revisions_json as string) || undefined,
    piNumber: (row.pi_number as string) || undefined,
    piFileUrl: (row.pi_file_url as string) || undefined,
    piStampedUrl: (row.pi_stamped_url as string) || undefined,
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

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const supplierName = url.searchParams.get('supplierName');
  const supplierId = url.searchParams.get('supplierId');
  const poId = url.searchParams.get('id'); // 단일 PO 빠른 조회
  const slim = url.searchParams.get('slim') === '1';
  const skipNotion = url.searchParams.get('skipNotion') === '1' || !!poId;

  // 단일 PO 빠른 조회: Notion 건너뜀
  if (poId) {
    const row = db.prepare('SELECT * FROM purchase_orders WHERE id=? LIMIT 1').get(poId) as Record<string, unknown> | undefined;
    return NextResponse.json({ data: row ? [dbToPO(row)] : [] });
  }

  // bizId 조회
  const bizId = url.searchParams.get('bizId');
  if (bizId) {
    const row = db.prepare('SELECT * FROM purchase_orders WHERE business_id=? LIMIT 1').get(bizId) as Record<string, unknown> | undefined;
    return NextResponse.json({ data: row ? [dbToPO(row)] : [] });
  }

  if (!skipNotion) {
    const ts = now();
    try {
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
  }

  let rows: Record<string, unknown>[];
  if (supplierId) {
    rows = db.prepare('SELECT * FROM purchase_orders WHERE supplier_id = ? ORDER BY created_at DESC').all(supplierId) as Record<string, unknown>[];
  } else if (supplierName) {
    rows = db.prepare('SELECT * FROM purchase_orders WHERE supplier_name = ? ORDER BY created_at DESC').all(supplierName) as Record<string, unknown>[];
    if (rows.length === 0) {
      rows = db.prepare("SELECT * FROM purchase_orders WHERE supplier_name LIKE ? ORDER BY created_at DESC").all(`%${supplierName}%`) as Record<string, unknown>[];
    }
  } else {
    rows = db.prepare('SELECT * FROM purchase_orders ORDER BY created_at DESC').all() as Record<string, unknown>[];
  }

  if (slim) {
    return NextResponse.json({ data: rows.map(r => ({ id: r.id, businessId: r.business_id, supplierName: r.supplier_name })) });
  }
  return NextResponse.json({ data: rows.map(dbToPO) });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();
    const bizId = body.businessId || nextBizId('PO');

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
      createdBy: user?.id || 'unknown',
      createdAt: ts, updatedAt: ts,
      imagesJson: body.imagesJson ?? null,
      depositRatio: body.depositRatio ?? '30',
    };

    // Save to Notion (ERP)
    const notionId = await createNotionPurchaseOrder(po).catch(() => null);

    // Save to SQLite
    poToDb(db, po, id, ts, notionId);

    // ETD 있으면 캘린더 이벤트 자동 생성
    if (body.etd) {
      createCalendarEvent({
        title: `발주 ETD: ${body.supplierName}`,
        date: body.etd,
        category: 'po',
        relatedId: id,
        userId: user?.id || 'unknown',
        userName: user?.name || '알 수 없음',
      }).catch(() => {});
    }

    return NextResponse.json({ data: po }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
