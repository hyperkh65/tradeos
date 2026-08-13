import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getNotionClient, DB, isDemoMode } from '@/lib/notion/client';

const RESULT_LABEL: Record<string, string> = { PASS: '합격', FAIL: '불합격', RETEST: '재시험', PENDING: '판정대기' };
const STATUS_LABEL: Record<string, string> = { scheduled: '예정', in_progress: '진행중', completed: '완료', on_hold: '보류' };

async function syncNotionUpdate(row: Record<string, unknown>) {
  const dbId = DB.inspections;
  if (!dbId || isDemoMode()) return;
  try {
    const notion = getNotionClient();
    const rt = (v: string) => [{ type: 'text' as const, text: { content: (v || '').slice(0, 2000) } }];
    const checkedQty = row.checked_qty != null ? Number(row.checked_qty) : null;
    const failedQty = row.failed_qty != null ? Number(row.failed_qty) : null;
    const defectRate = row.defect_rate != null ? Number(row.defect_rate) : null;

    const props: Record<string, unknown> = {
      '검품번호': { title: rt(row.business_id as string) },
      '공급업체': { rich_text: rt(row.supplier_name as string || '') },
      '제품명': { rich_text: rt((row.product_name_manual || row.product_name) as string || '') },
      '발주번호': { rich_text: rt(row.po_business_id as string || '') },
      '검품유형': { select: { name: row.inspection_type as string || '공장검품' } },
      '검품일': row.inspection_date ? { date: { start: row.inspection_date } } : { date: null },
      '결과': { select: { name: RESULT_LABEL[row.result as string] || '판정대기' } },
      '상태': { select: { name: STATUS_LABEL[row.status as string] || '예정' } },
      '검품자': { rich_text: rt(row.inspector as string || '') },
      '샘플수량': { number: row.sample_qty ?? null },
      '검품수량': { number: checkedQty },
      '불량수량': { number: failedQty },
      '불량률': { number: defectRate != null ? defectRate / 100 : null },
      '요약': { rich_text: rt(row.summary as string || '') },
      '의견': { rich_text: rt(row.opinion as string || '') },
    };

    const notionId = row.notion_id as string | null;
    if (notionId) {
      await notion.pages.update({ page_id: notionId, properties: props as any });
    } else {
      const dbId2 = DB.inspections;
      const page = await notion.pages.create({ parent: { database_id: dbId2 }, properties: props as any });
      // Store notion_id
      try { getDb().prepare('UPDATE inspections SET notion_id=? WHERE id=?').run(page.id, row.id); } catch { /* ignore */ }
    }
  } catch (e) {
    console.error('[Inspection] Notion update error:', e);
  }
}

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

    const reportFiles = body.reportFiles !== undefined ? JSON.stringify(body.reportFiles) : ((row.report_files as string) || '[]');
    const imageFiles = body.imageFiles !== undefined ? JSON.stringify(body.imageFiles) : ((row.image_files as string) || '[]');

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

    // Async Notion sync
    const updatedRow = db.prepare('SELECT * FROM inspections WHERE id=?').get(id) as Record<string, unknown>;
    syncNotionUpdate(updatedRow).catch(() => {});

    return NextResponse.json({ data: { ...updatedRow, defectRate, updatedAt: ts } });
  } catch (e) {
    console.error('[inspection PUT]', e);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT notion_id FROM inspections WHERE id=?').get(id) as { notion_id: string } | undefined;
    db.prepare('DELETE FROM inspections WHERE id=?').run(id);
    // Archive Notion page
    if (row?.notion_id && DB.inspections && !isDemoMode()) {
      getNotionClient().pages.update({ page_id: row.notion_id, archived: true }).catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
