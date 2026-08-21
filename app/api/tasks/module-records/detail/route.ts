import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

type RawRow = Record<string, unknown>;
type RawItem = Record<string, unknown>;

function parseItems(json: unknown): RawItem[] {
  try { return JSON.parse(String(json || '[]')); } catch { return []; }
}

function itemName(i: RawItem, idx: number): string {
  const n = String(
    i.productName || i.product || i.name || i.name_ko ||
    i.product_name || i.itemName || i.item_name || ''
  ).trim();
  return n || `품목 ${idx + 1}`;
}
function itemSpec(i: RawItem): string {
  return String(i.specification || i.spec || i.description || '').trim();
}
function itemQty(i: RawItem): number | undefined {
  const v = i.qty ?? i.quantity ?? i.count ?? i.pcs;
  return v != null ? Number(v) : undefined;
}
function itemUnitPrice(i: RawItem): number | undefined {
  const v = i.unitPrice ?? i.unit_price ?? i.price ?? i.pricePerUnit;
  if (v != null) return Number(v);
  // 역산: amount / qty
  const a = i.amount != null ? Number(i.amount) : undefined;
  const q = itemQty(i);
  if (a != null && q != null && q > 0) return a / q;
  return undefined;
}
function itemAmount(i: RawItem, currency: string): { amount: number | undefined; currency: string } {
  const a = i.amount != null ? Number(i.amount)
    : (itemQty(i) != null && itemUnitPrice(i) != null ? (itemQty(i)! * itemUnitPrice(i)!) : undefined);
  return { amount: a, currency };
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const module = searchParams.get('module') || '';
  const bizId = searchParams.get('id') || '';
  if (!bizId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = getDb();

  try {
    switch (module) {
      case 'quote': {
        const r = db.prepare(`SELECT * FROM quotes WHERE business_id = ?`).get(bizId) as RawRow | undefined;
        if (!r) return NextResponse.json({ error: '없음' }, { status: 404 });
        const items = parseItems(r.items_json);
        const cur = String(r.currency || '');
        const total = items.reduce((s, i) => s + (itemAmount(i, cur).amount ?? 0), 0);
        return NextResponse.json({
          type: 'quote',
          title: `견적 ${r.business_id}`,
          fields: [
            { label: '거래처', value: r.company_name },
            { label: '견적일', value: String(r.quote_date || r.created_at || '').slice(0, 10) },
            { label: '통화', value: r.currency },
            { label: '상태', value: r.status },
            { label: '유효기간', value: r.validity || '-' },
            { label: '결제조건', value: r.payment_terms || '-' },
            { label: '인코텀', value: r.incoterm || '-' },
            { label: '비고', value: r.remark || '-' },
          ],
          items: items.map((i, idx) => ({
            name: itemName(i, idx), spec: itemSpec(i),
            qty: itemQty(i), unit_price: itemUnitPrice(i),
            amount: itemAmount(i, cur).amount, currency: cur,
          })),
          _raw0: items[0] ? JSON.stringify(items[0]) : null,
          total, currency: r.currency,
        });
      }
      case 'po': {
        const r = db.prepare(`SELECT * FROM purchase_orders WHERE business_id = ?`).get(bizId) as RawRow | undefined;
        if (!r) return NextResponse.json({ error: '없음' }, { status: 404 });
        const items = parseItems(r.items_json);
        const cur = String(r.currency || '');
        return NextResponse.json({
          type: 'po',
          title: `발주 ${r.business_id}`,
          fields: [
            { label: '공급업체', value: r.supplier_name },
            { label: '발주일', value: String(r.order_date || '').slice(0, 10) },
            { label: '통화', value: r.currency },
            { label: '총액', value: r.total_amount ? `${Number(r.total_amount).toLocaleString()} ${cur}` : '-' },
            { label: '상태', value: r.status },
            { label: '결제조건', value: r.payment_terms || '-' },
            { label: '인코텀', value: r.incoterm || '-' },
            { label: 'ETD', value: String(r.etd || '-').slice(0, 10) },
            { label: '생산완료', value: String(r.production_due_date || '-').slice(0, 10) },
            { label: '비고', value: r.remark || '-' },
          ],
          items: items.map((i, idx) => ({
            name: itemName(i, idx), spec: itemSpec(i),
            qty: itemQty(i), unit_price: itemUnitPrice(i),
            amount: itemAmount(i, cur).amount, currency: cur,
          })),
          _raw0: items[0] ? JSON.stringify(items[0]) : null,
          total: r.total_amount, currency: r.currency,
        });
      }
      case 'sale': {
        const r = db.prepare(`SELECT * FROM sales WHERE business_id = ?`).get(bizId) as RawRow | undefined;
        if (!r) return NextResponse.json({ error: '없음' }, { status: 404 });
        const items = parseItems(r.items_json);
        const cur = String(r.currency || 'KRW');
        return NextResponse.json({
          type: 'sale',
          title: `매출 ${r.business_id}`,
          fields: [
            { label: '고객', value: r.customer },
            { label: '매출일', value: String(r.sale_date || '').slice(0, 10) },
            { label: '통화', value: r.currency },
            { label: '공급가', value: r.net_amount ? `${Number(r.net_amount).toLocaleString()} ${cur}` : '-' },
            { label: '부가세', value: r.vat ? `${Number(r.vat).toLocaleString()} ${cur}` : '-' },
            { label: '합계', value: r.total_amount ? `${Number(r.total_amount).toLocaleString()} ${cur}` : '-' },
            { label: '유형', value: r.sale_type || '-' },
            { label: '영업자', value: r.salesperson || '-' },
          ],
          items: items.map((i, idx) => ({
            name: itemName(i, idx), spec: itemSpec(i),
            qty: itemQty(i), unit_price: itemUnitPrice(i),
            amount: itemAmount(i, cur).amount, currency: cur,
          })),
          total: r.total_amount, currency: r.currency,
        });
      }
      case 'shipment': {
        const r = db.prepare(`SELECT * FROM shipments WHERE business_id = ?`).get(bizId) as RawRow | undefined;
        if (!r) return NextResponse.json({ error: '없음' }, { status: 404 });
        return NextResponse.json({
          type: 'shipment',
          title: `선적 ${r.business_id}`,
          fields: [
            { label: '운송사', value: r.forwarder_name || '-' },
            { label: '유형', value: r.type },
            { label: 'POL', value: r.pol || '-' },
            { label: 'POD', value: r.pod || '-' },
            { label: 'ETD', value: String(r.etd || '-').slice(0, 10) },
            { label: 'ETA', value: String(r.eta || '-').slice(0, 10) },
            { label: 'BL No', value: r.bl_no || '-' },
            { label: '상태', value: r.status },
            { label: 'CBM', value: r.cbm ? `${r.cbm} CBM` : '-' },
            { label: '중량', value: r.gross_weight ? `${r.gross_weight} kg` : '-' },
          ],
          items: [], total: null, currency: null,
        });
      }
      case 'claim': {
        const r = db.prepare(`SELECT * FROM claims WHERE business_id = ?`).get(bizId) as RawRow | undefined;
        if (!r) return NextResponse.json({ error: '없음' }, { status: 404 });
        return NextResponse.json({
          type: 'claim',
          title: `클레임 ${r.business_id}`,
          fields: [
            { label: '고객', value: r.customer_name || '-' },
            { label: '공급업체', value: r.supplier_name || '-' },
            { label: '제품', value: r.product_name || '-' },
            { label: '상태', value: r.status },
            { label: '발생일', value: String(r.created_at || '').slice(0, 10) },
          ],
          items: [], total: null, currency: null,
        });
      }
      case 'inspection': {
        const r = db.prepare(`SELECT * FROM inspections WHERE business_id = ?`).get(bizId) as RawRow | undefined;
        if (!r) return NextResponse.json({ error: '없음' }, { status: 404 });
        return NextResponse.json({
          type: 'inspection',
          title: `검품 ${r.business_id}`,
          fields: [
            { label: '공급업체', value: r.supplier_name },
            { label: '제품', value: r.product_name },
            { label: '검품일', value: String(r.inspection_date || '').slice(0, 10) },
            { label: '결과', value: r.result },
            { label: '유형', value: r.inspection_type },
            { label: '수량', value: r.sample_qty ? `샘플 ${r.sample_qty}개` : '-' },
            { label: '불량', value: r.defect_rate != null ? `${r.defect_rate}%` : '-' },
            { label: 'PO', value: r.po_business_id || '-' },
            { label: '요약', value: r.summary || '-' },
          ],
          items: [], total: null, currency: null,
        });
      }
      case 'cost': {
        const r = db.prepare(`SELECT * FROM cost_records WHERE business_id = ?`).get(bizId) as RawRow | undefined;
        if (!r) return NextResponse.json({ error: '없음' }, { status: 404 });
        return NextResponse.json({
          type: 'cost',
          title: `비용 ${r.business_id}`,
          fields: [
            { label: '유형', value: r.cost_type },
            { label: '설명', value: r.description || '-' },
            { label: '고객', value: r.client_name || '-' },
            { label: '발생일', value: String(r.incurred_date || '').slice(0, 10) },
            { label: '금액', value: r.cost_amount ? `${Number(r.cost_amount).toLocaleString()} ${r.cost_currency}` : '-' },
            { label: '처리상태', value: r.disposition },
            { label: '청구상태', value: r.bill_status || '-' },
            { label: 'PO', value: r.po_business_id || '-' },
            { label: '선적', value: r.shipment_business_id || '-' },
          ],
          items: [], total: null, currency: null,
        });
      }
      case 'company': {
        const r = db.prepare(`SELECT * FROM companies WHERE business_id = ?`).get(bizId) as RawRow | undefined;
        if (!r) return NextResponse.json({ error: '없음' }, { status: 404 });
        return NextResponse.json({
          type: 'company',
          title: String(r.name || ''),
          fields: [
            { label: '유형', value: r.type },
            { label: '국가', value: r.country },
            { label: '이메일', value: r.email || '-' },
            { label: '전화', value: r.phone || '-' },
            { label: '담당자', value: r.contact_person || '-' },
            { label: 'WeChat', value: r.wechat || '-' },
            { label: '거래통화', value: r.trade_currency || '-' },
          ],
          items: [], total: null, currency: null,
        });
      }
      default:
        return NextResponse.json({ error: '지원하지 않는 모듈' }, { status: 400 });
    }
  } catch (e) {
    console.error('[module-detail]', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
