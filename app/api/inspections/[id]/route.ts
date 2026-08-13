import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM inspections WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const checkedQty = body.checkedQty != null ? Number(body.checkedQty) : (row.checked_qty != null ? Number(row.checked_qty) : null);
    const failedQty = body.failedQty != null ? Number(body.failedQty) : (row.failed_qty != null ? Number(row.failed_qty) : null);
    const passedQty = (checkedQty != null && failedQty != null) ? checkedQty - failedQty : (row.passed_qty != null ? Number(row.passed_qty) : null);
    const defectRate = (checkedQty && failedQty) ? Number(((failedQty / checkedQty) * 100).toFixed(2)) : (row.defect_rate != null ? Number(row.defect_rate) : null);

    const reportFiles = body.reportFiles !== undefined ? JSON.stringify(body.reportFiles) : (row.report_files as string || '[]');
    const imageFiles = body.imageFiles !== undefined ? JSON.stringify(body.imageFiles) : (row.image_files as string || '[]');

    db.prepare(`UPDATE inspections SET inspection_date=?,inspector=?,inspection_type=?,sample_qty=?,checked_qty=?,passed_qty=?,failed_qty=?,defect_rate=?,result=?,summary=?,opinion=?,report_files=?,image_files=?,status=?,product_name=?,product_name_manual=?,supplier_name=?,po_id=?,po_business_id=? WHERE id=?`)
      .run(
        body.inspectionDate ?? row.inspection_date,
        body.inspector ?? row.inspector,
        body.inspectionType ?? row.inspection_type,
        body.sampleQty != null ? Number(body.sampleQty) : row.sample_qty,
        checkedQty, passedQty, failedQty, defectRate,
        body.result ?? row.result,
        body.summary ?? row.summary,
        body.opinion ?? row.opinion,
        reportFiles, imageFiles,
        body.status ?? row.status,
        body.productName ?? row.product_name,
        body.productNameManual ?? row.product_name_manual,
        body.supplierName ?? row.supplier_name,
        body.poId ?? row.po_id,
        body.poBusinessId ?? row.po_business_id,
        id
      );

    return NextResponse.json({ data: { ...row, ...body, defectRate, updatedAt: ts } });
  } catch (e) {
    console.error('[inspection PUT]', e);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM inspections WHERE id=?').run(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
