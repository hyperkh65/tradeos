import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { DEMO_PURCHASE_ORDERS } from '@/lib/demo-data';

function dbToPO(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, supplierId: row.supplier_id, supplierName: row.supplier_name,
    items: JSON.parse(row.items_json as string || '[]'),
    currency: row.currency, totalAmount: row.total_amount, depositAmount: row.deposit_amount||undefined,
    balanceAmount: row.balance_amount||undefined, paymentTerms: row.payment_terms||undefined,
    orderDate: row.order_date, productionDueDate: row.production_due_date||undefined,
    inspectionDate: row.inspection_date||undefined, etd: row.etd||undefined,
    status: row.status, incoterm: row.incoterm||undefined, remark: row.remark||undefined,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM purchase_orders ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToPO) });

    // Seed
    const seed = db.prepare(`INSERT OR IGNORE INTO purchase_orders (id,business_id,supplier_id,supplier_name,items_json,currency,total_amount,deposit_amount,balance_amount,payment_terms,order_date,production_due_date,inspection_date,etd,status,incoterm,remark,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const po of DEMO_PURCHASE_ORDERS) {
        seed.run(po.id,po.businessId,po.supplierId,po.supplierName,JSON.stringify(po.items),po.currency,po.totalAmount,po.depositAmount??null,po.balanceAmount??null,po.paymentTerms??null,po.orderDate,po.productionDueDate??null,po.inspectionDate??null,po.etd??null,po.status,po.incoterm??null,po.remark??null,po.createdBy,po.createdAt,po.updatedAt);
      }
    })();
    return NextResponse.json({ data: DEMO_PURCHASE_ORDERS });
  } catch (e) {
    return NextResponse.json({ data: DEMO_PURCHASE_ORDERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM purchase_orders WHERE business_id LIKE 'PO-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string }|undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g,'') || '0') : 0;
    const year = new Date().getFullYear();
    const bizId = body.businessId || `PO-${year}-${String(lastNum + 1).padStart(4,'0')}`;

    const items = body.items || [];
    const total = items.reduce((s: number, i: { amount: number }) => s + (i.amount || 0), 0);

    db.prepare(`INSERT INTO purchase_orders (id,business_id,supplier_id,supplier_name,items_json,currency,total_amount,deposit_amount,balance_amount,payment_terms,order_date,production_due_date,inspection_date,etd,status,incoterm,remark,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,bizId,body.supplierId||'',body.supplierName,JSON.stringify(items),body.currency||'USD',total,body.depositAmount??null,body.balanceAmount??null,body.paymentTerms??null,body.orderDate,body.productionDueDate??null,body.inspectionDate??null,body.etd??null,body.status||'draft',body.incoterm??null,body.remark??null,'user-1',ts,ts);

    return NextResponse.json({ data: { id, businessId: bizId, ...body, totalAmount: total, createdBy:'user-1', createdAt:ts, updatedAt:ts } }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
