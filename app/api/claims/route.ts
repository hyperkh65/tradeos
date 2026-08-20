import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { getNotionClient, DB, isDemoMode } from '@/lib/notion/client';
import { createCalendarEvent } from '@/lib/calendar-events';

// ─── helpers ─────────────────────────────────────────────────────────────────

export function dbToClaim(row: Record<string, unknown>) {
  const parseFiles = (v: unknown) => { try { return JSON.parse((v as string) || '[]'); } catch { return []; } };
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
    notionId: row.notion_id || undefined,
    imageFiles: parseFiles(row.image_files),
    reportFiles: parseFiles(row.report_files),
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// ─── Notion sync ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { '접수': '접수', '내부확인': '내부확인', '업체전달': '업체전달', '협상': '협상', '합의': '합의', '완료': '완료' };

async function syncToNotion(data: ReturnType<typeof dbToClaim>, notionPageId?: string): Promise<string | null> {
  const dbId = DB.claims;
  if (!dbId || isDemoMode()) return null;
  try {
    const notion = getNotionClient();
    const rt = (v: unknown) => [{ type: 'text' as const, text: { content: (String(v ?? '') || '').slice(0, 2000) } }];
    const props: Record<string, unknown> = {
      '클레임번호': { title: rt(data.businessId) },
      '이슈유형': { select: { name: String(data.issueType || '기타') } },
      '상태': { select: { name: STATUS_LABEL[String(data.status)] || '접수' } },
      '고객사': { rich_text: rt(data.customerName || '') },
      '공급업체': { rich_text: rt(data.supplierName || '') },
      '제품명': { rich_text: rt(data.productName || '') },
      '발주번호': { rich_text: rt(data.poBusinessId || '') },
      '매출번호': { rich_text: rt(data.saleBusinessId || '') },
      '클레임금액': { number: data.claimAmount != null ? Number(data.claimAmount) : null },
      '통화': { select: { name: String(data.currency || 'USD') } },
      '처리방법': { select: data.compensationType ? { name: String(data.compensationType) } : null },
      '처리금액': { number: data.compensationAmount != null ? Number(data.compensationAmount) : null },
      '설명': { rich_text: rt(data.description || '') },
    };
    if (notionPageId) {
      await notion.pages.update({ page_id: notionPageId, properties: props as any });
      return notionPageId;
    } else {
      const page = await notion.pages.create({ parent: { database_id: dbId }, properties: props as any });
      return page.id;
    }
  } catch (e) {
    console.error('[Claims] Notion sync error:', e);
    return null;
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM claims ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return NextResponse.json({ data: rows.map(dbToClaim) });
  } catch {
    return NextResponse.json({ data: [] });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();
    const bizId = body.businessId || nextBizId('CLM');

    db.prepare(`INSERT INTO claims (id,business_id,customer_id,customer_name,supplier_id,supplier_name,product_id,product_name,po_id,po_business_id,sale_id,sale_business_id,shipment_id,issue_type,description,claim_amount,currency,compensation_type,compensation_amount,status,image_files,report_files,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, bizId, body.customerId ?? null, body.customerName ?? null, body.supplierId ?? null, body.supplierName ?? null, body.productId ?? null, body.productName ?? null, body.poId ?? null, body.poBusinessId ?? null, body.saleId ?? null, body.saleBusinessId ?? null, body.shipmentId ?? null, body.issueType, body.description, body.claimAmount ?? null, body.currency ?? null, body.compensationType ?? null, body.compensationAmount ?? null, body.status || '접수', JSON.stringify(body.imageFiles || []), JSON.stringify(body.reportFiles || []), user?.id || 'unknown', ts, ts);

    const saved = dbToClaim(db.prepare('SELECT * FROM claims WHERE id=?').get(id) as Record<string, unknown>);

    // 클레임 캘린더 이벤트 자동 생성
    createCalendarEvent({
      title: `클레임: ${body.description?.slice(0, 30) ?? bizId}`,
      date: ts.slice(0, 10),
      category: 'claim',
      relatedId: id,
      userId: user?.id || 'unknown',
      userName: user?.name || '알 수 없음',
    }).catch(() => {});

    // Async Notion sync
    syncToNotion(saved).then(notionId => {
      if (notionId) {
        try { db.prepare('UPDATE claims SET notion_id=? WHERE id=?').run(notionId, id); } catch { /* ignore */ }
      }
    }).catch(() => {});

    return NextResponse.json({ data: saved }, { status: 201 });
  } catch (e) {
    console.error('[claims POST]', e);
    return NextResponse.json({ error: '저장 실패: ' + String(e) }, { status: 500 });
  }
}
