import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';;
import { getNotionClient, DB, isDemoMode } from '@/lib/notion/client';
import { DEMO_INSPECTIONS } from '@/lib/demo-data';
import { syncIndexOnWrite } from '@/lib/ai/sync';

const RESULT_LABEL: Record<string, string> = { PASS: '합격', FAIL: '불합격', RETEST: '재시험', PENDING: '판정대기' };
const STATUS_LABEL: Record<string, string> = { scheduled: '예정', in_progress: '진행중', completed: '완료', on_hold: '보류' };

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

async function syncToNotion(data: ReturnType<typeof dbToInspection>, notionPageId?: string): Promise<string | null> {
  const dbId = DB.inspections;
  if (!dbId || isDemoMode()) return null;
  try {
    const notion = getNotionClient();
    const rt = (v: string) => [{ type: 'text' as const, text: { content: (String(v) || '').slice(0, 2000) } }];
    const props: Record<string, any> = {
      '검품번호': { title: rt(String(data.businessId)) },
      '공급업체': { rich_text: rt(String(data.supplierName || '')) },
      '제품명': { rich_text: rt(String(data.productNameManual || data.productName || '')) },
      '발주번호': { rich_text: rt(String(data.poBusinessId || '')) },
      '검품유형': { select: { name: String(data.inspectionType || '공장검품') } },
      '검품일': data.inspectionDate ? { date: { start: String(data.inspectionDate) } } : { date: null },
      '결과': { select: { name: RESULT_LABEL[String(data.result)] || '판정대기' } },
      '상태': { select: { name: STATUS_LABEL[String(data.status)] || '예정' } },
      '검품자': { rich_text: rt(String(data.inspector || '')) },
      '샘플수량': { number: data.sampleQty ?? null },
      '검품수량': { number: data.checkedQty ?? null },
      '불량수량': { number: data.failedQty ?? null },
      '불량률': { number: data.defectRate != null ? Number(data.defectRate) / 100 : null },
      '요약': { rich_text: rt(String(data.summary || '')) },
      '의견': { rich_text: rt(String(data.opinion || '')) },
    };
    if (notionPageId) {
      await notion.pages.update({ page_id: notionPageId, properties: props });
      return notionPageId;
    } else {
      const page = await notion.pages.create({ parent: { database_id: dbId }, properties: props });
      return page.id;
    }
  } catch (e) {
    console.error('[Inspection] Notion sync error:', e);
    return null;
  }
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

    const bizId = body.businessId || nextBizId('QC');

    const checkedQty = body.checkedQty != null ? Number(body.checkedQty) : null;
    const failedQty = body.failedQty != null ? Number(body.failedQty) : null;
    const passedQty = (checkedQty != null && failedQty != null) ? checkedQty - failedQty : null;
    const defectRate = (checkedQty && failedQty) ? Number(((failedQty / checkedQty) * 100).toFixed(2)) : null;

    db.prepare(`INSERT INTO inspections (id,business_id,po_id,po_business_id,supplier_id,supplier_name,product_id,product_name,product_name_manual,inspection_date,inspector,inspection_type,sample_qty,checked_qty,passed_qty,failed_qty,defect_rate,result,summary,opinion,report_files,image_files,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, bizId, body.poId || '', body.poBusinessId || '', body.supplierId || '', body.supplierName || '', body.productId || '', body.productName || '', body.productNameManual || null, body.inspectionDate, body.inspector ?? null, body.inspectionType || '공장검품', body.sampleQty || 0, checkedQty, passedQty, failedQty, defectRate, body.result || 'PENDING', body.summary ?? null, body.opinion ?? null, JSON.stringify(body.reportFiles || []), JSON.stringify(body.imageFiles || []), body.status || 'scheduled', ts);

    const saved = dbToInspection(db.prepare('SELECT * FROM inspections WHERE id=?').get(id) as Record<string, unknown>);

    // Async Notion sync
    syncToNotion(saved).then(notionId => {
      if (notionId) {
        try { db.prepare('UPDATE inspections SET notion_id=? WHERE id=?').run(notionId, id); } catch { /* ignore */ }
      }
    }).catch(() => {});

    syncIndexOnWrite('inspection', id);
    return NextResponse.json({ data: saved }, { status: 201 });
  } catch (e) {
    console.error('[inspection POST]', e);
    return NextResponse.json({ error: '저장 실패: ' + String(e) }, { status: 500 });
  }
}
