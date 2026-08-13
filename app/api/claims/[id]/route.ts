import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getNotionClient, DB, isDemoMode } from '@/lib/notion/client';
import { dbToClaim } from '../route';

async function syncNotionUpdate(row: Record<string, unknown>) {
  const dbId = DB.claims;
  if (!dbId || isDemoMode()) return;
  try {
    const notion = getNotionClient();
    const rt = (v: unknown) => [{ type: 'text' as const, text: { content: (String(v ?? '') || '').slice(0, 2000) } }];
    const STATUS_MAP: Record<string, string> = { '접수': '접수', '내부확인': '내부확인', '업체전달': '업체전달', '협상': '협상', '합의': '합의', '완료': '완료' };
    const props: Record<string, unknown> = {
      '클레임번호': { title: rt(row.business_id) },
      '이슈유형': { select: { name: String(row.issue_type || '기타') } },
      '상태': { select: { name: STATUS_MAP[String(row.status)] || '접수' } },
      '고객사': { rich_text: rt(row.customer_name || '') },
      '공급업체': { rich_text: rt(row.supplier_name || '') },
      '제품명': { rich_text: rt(row.product_name || '') },
      '발주번호': { rich_text: rt(row.po_business_id || '') },
      '매출번호': { rich_text: rt(row.sale_business_id || '') },
      '클레임금액': { number: row.claim_amount != null ? Number(row.claim_amount) : null },
      '통화': { select: { name: String(row.currency || 'USD') } },
      '처리방법': { select: row.compensation_type ? { name: String(row.compensation_type) } : null },
      '처리금액': { number: row.compensation_amount != null ? Number(row.compensation_amount) : null },
      '설명': { rich_text: rt(row.description || '') },
    };
    const notionId = row.notion_id as string | null;
    if (notionId) {
      await notion.pages.update({ page_id: notionId, properties: props as any });
    } else {
      const page = await notion.pages.create({ parent: { database_id: dbId }, properties: props as any });
      try { getDb().prepare('UPDATE claims SET notion_id=? WHERE id=?').run(page.id, row.id); } catch { /* ignore */ }
    }
  } catch (e) {
    console.error('[Claims] Notion update error:', e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();
    const row = db.prepare('SELECT * FROM claims WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const resolvedAt = body.status === '완료' && !row.resolved_at ? ts : (row.resolved_at ?? null);
    const imageFiles = body.imageFiles !== undefined ? JSON.stringify(body.imageFiles) : ((row.image_files as string) || '[]');
    const reportFiles = body.reportFiles !== undefined ? JSON.stringify(body.reportFiles) : ((row.report_files as string) || '[]');

    db.prepare(`UPDATE claims SET
      issue_type=?, description=?, status=?,
      customer_id=?, customer_name=?,
      supplier_id=?, supplier_name=?,
      product_id=?, product_name=?,
      po_id=?, po_business_id=?,
      sale_id=?, sale_business_id=?,
      shipment_id=?,
      claim_amount=?, currency=?,
      compensation_type=?, compensation_amount=?,
      image_files=?, report_files=?,
      resolved_at=?, updated_at=?
      WHERE id=?`)
      .run(
        body.issueType ?? row.issue_type,
        body.description ?? row.description,
        body.status ?? row.status,
        body.customerId ?? row.customer_id ?? null,
        body.customerName ?? row.customer_name ?? null,
        body.supplierId ?? row.supplier_id ?? null,
        body.supplierName ?? row.supplier_name ?? null,
        body.productId ?? row.product_id ?? null,
        body.productName ?? row.product_name ?? null,
        body.poId ?? row.po_id ?? null,
        body.poBusinessId ?? row.po_business_id ?? null,
        body.saleId ?? row.sale_id ?? null,
        body.saleBusinessId ?? row.sale_business_id ?? null,
        body.shipmentId ?? row.shipment_id ?? null,
        body.claimAmount ?? row.claim_amount ?? null,
        body.currency ?? row.currency ?? null,
        body.compensationType ?? row.compensation_type ?? null,
        body.compensationAmount ?? row.compensation_amount ?? null,
        imageFiles, reportFiles,
        resolvedAt, ts, id,
      );

    const updated = db.prepare('SELECT * FROM claims WHERE id=?').get(id) as Record<string, unknown>;
    syncNotionUpdate(updated).catch(() => {});

    return NextResponse.json({ data: dbToClaim(updated) });
  } catch (e) {
    console.error('[claims PUT]', e);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT notion_id FROM claims WHERE id=?').get(id) as { notion_id: string } | undefined;
    db.prepare('DELETE FROM claims WHERE id=?').run(id);
    if (row?.notion_id && DB.claims && !isDemoMode()) {
      getNotionClient().pages.update({ page_id: row.notion_id, archived: true }).catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
