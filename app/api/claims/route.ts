import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { DEMO_CLAIMS } from '@/lib/demo-data';

export function dbToClaim(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id,
    customerId: row.customer_id || undefined, customerName: row.customer_name || undefined,
    supplierId: row.supplier_id || undefined, supplierName: row.supplier_name || undefined,
    productId: row.product_id || undefined, productName: row.product_name || undefined,
    poId: row.po_id || undefined, poBusinessId: row.po_business_id || undefined,
    saleId: row.sale_id || undefined, saleBusinessId: row.sale_business_id || undefined,
    shipmentId: row.shipment_id || undefined,
    issueType: row.issue_type, description: row.description,
    claimAmount: row.claim_amount || undefined, currency: row.currency || undefined,
    compensationType: row.compensation_type || undefined, compensationAmount: row.compensation_amount || undefined,
    status: row.status, resolvedAt: row.resolved_at || undefined,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM claims ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToClaim) });

    const seed = db.prepare(`INSERT OR IGNORE INTO claims (id,business_id,customer_id,customer_name,supplier_id,supplier_name,product_id,product_name,po_id,po_business_id,issue_type,description,claim_amount,currency,compensation_type,compensation_amount,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const c of DEMO_CLAIMS) {
        seed.run(c.id, c.businessId, c.customerId ?? null, c.customerName ?? null, c.supplierId ?? null, c.supplierName ?? null, c.productId ?? null, c.productName ?? null, c.poId ?? null, c.poBusinessId ?? null, c.issueType, c.description, c.claimAmount ?? null, c.currency ?? null, c.compensationType ?? null, c.compensationAmount ?? null, c.status, c.createdBy, c.createdAt, c.updatedAt);
      }
    })();
    return NextResponse.json({ data: DEMO_CLAIMS });
  } catch {
    return NextResponse.json({ data: DEMO_CLAIMS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM claims WHERE business_id LIKE 'CLM-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g, '') || '0') : 0;
    const year = new Date().getFullYear();
    const bizId = body.businessId || `CLM-${year}-${String(lastNum + 1).padStart(4, '0')}`;

    db.prepare(`INSERT INTO claims (id,business_id,customer_id,customer_name,supplier_id,supplier_name,product_id,product_name,po_id,po_business_id,sale_id,sale_business_id,shipment_id,issue_type,description,claim_amount,currency,compensation_type,compensation_amount,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, bizId, body.customerId ?? null, body.customerName ?? null, body.supplierId ?? null, body.supplierName ?? null, body.productId ?? null, body.productName ?? null, body.poId ?? null, body.poBusinessId ?? null, body.saleId ?? null, body.saleBusinessId ?? null, body.shipmentId ?? null, body.issueType, body.description, body.claimAmount ?? null, body.currency ?? null, body.compensationType ?? null, body.compensationAmount ?? null, body.status || '접수', 'user-1', ts, ts);

    return NextResponse.json({ data: { id, businessId: bizId, ...body, createdBy: 'user-1', createdAt: ts, updatedAt: ts } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
