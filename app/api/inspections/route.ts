import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { DEMO_INSPECTIONS } from '@/lib/demo-data';

function dbToInspection(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id,
    poId: row.po_id || undefined, poBusinessId: row.po_business_id || undefined,
    supplierId: row.supplier_id || undefined, supplierName: row.supplier_name,
    productId: row.product_id || undefined, productName: row.product_name,
    productNameManual: row.product_name_manual || undefined,
    inspectionDate: row.inspection_date, inspector: row.inspector || undefined,
    inspectionType: row.inspection_type,
    sampleQty: row.sample_qty, checkedQty: row.checked_qty || undefined,
    passedQty: row.passed_qty || undefined, failedQty: row.failed_qty || undefined,
    defectRate: row.defect_rate || undefined,
    result: row.result, summary: row.summary || undefined,
    opinion: row.opinion || undefined,
    reportFiles: (() => { try { return JSON.parse((row.report_files as string) || '[]'); } catch { return []; } })(),
    imageFiles: (() => { try { return JSON.parse((row.image_files as string) || '[]'); } catch { return []; } })(),
    status: row.status, createdAt: row.created_at,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM inspections ORDER BY created_at DESC').all() as Record<string, unknown>[];
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToInspection) });

    const seed = db.prepare(`INSERT OR IGNORE INTO inspections (id,business_id,po_id,po_business_id,supplier_id,supplier_name,product_id,product_name,inspection_date,inspector,inspection_type,sample_qty,checked_qty,passed_qty,failed_qty,defect_rate,result,summary,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const q of DEMO_INSPECTIONS) {
        seed.run(q.id, q.businessId, q.poId, q.poBusinessId, q.supplierId, q.supplierName, q.productId, q.productName, q.inspectionDate, q.inspector ?? null, q.inspectionType, q.sampleQty, q.checkedQty ?? null, q.passedQty ?? null, q.failedQty ?? null, q.defectRate ?? null, q.result, q.summary ?? null, q.status, q.createdAt);
      }
    })();
    return NextResponse.json({ data: DEMO_INSPECTIONS });
  } catch {
    return NextResponse.json({ data: DEMO_INSPECTIONS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const lastRow = db.prepare(`SELECT business_id FROM inspections WHERE business_id LIKE 'QC-%' ORDER BY business_id DESC LIMIT 1`).get() as { business_id: string } | undefined;
    const lastNum = lastRow ? parseInt(lastRow.business_id.replace(/[^0-9]/g, '') || '0') : 0;
    const year = new Date().getFullYear();
    const bizId = body.businessId || `QC-${year}-${String(lastNum + 1).padStart(4, '0')}`;

    const checkedQty = body.checkedQty != null ? Number(body.checkedQty) : null;
    const failedQty = body.failedQty != null ? Number(body.failedQty) : null;
    const passedQty = (checkedQty != null && failedQty != null) ? checkedQty - failedQty : null;
    const defectRate = (checkedQty && failedQty) ? Number(((failedQty / checkedQty) * 100).toFixed(2)) : null;

    db.prepare(`INSERT INTO inspections (id,business_id,po_id,po_business_id,supplier_id,supplier_name,product_id,product_name,product_name_manual,inspection_date,inspector,inspection_type,sample_qty,checked_qty,passed_qty,failed_qty,defect_rate,result,summary,opinion,report_files,image_files,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, bizId, body.poId || '', body.poBusinessId || '', body.supplierId || '', body.supplierName || '', body.productId || '', body.productName || '', body.productNameManual || null, body.inspectionDate, body.inspector ?? null, body.inspectionType || '공장검품', body.sampleQty || 0, checkedQty, passedQty, failedQty, defectRate, body.result || 'PENDING', body.summary ?? null, body.opinion ?? null, JSON.stringify(body.reportFiles || []), JSON.stringify(body.imageFiles || []), body.status || 'scheduled', ts);

    return NextResponse.json({ data: dbToInspection(db.prepare('SELECT * FROM inspections WHERE id=?').get(id) as Record<string, unknown>) }, { status: 201 });
  } catch (e) {
    console.error('[inspection POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
