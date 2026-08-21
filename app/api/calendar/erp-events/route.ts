import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export interface ErpEvent {
  id: string;
  date: string;
  title: string;
  erpType: string;
  link: string;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get('month') || '0'); // 0-indexed (Jan=0)

  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const toDate = new Date(year, month + 1, 1);
  const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-01`;

  const db = getDb();
  const events: ErpEvent[] = [];

  try {
    // 거래처 신규 등록
    const companies = db.prepare(
      `SELECT business_id, name, created_at FROM companies
       WHERE substr(created_at,1,10) >= ? AND substr(created_at,1,10) < ?
       ORDER BY created_at DESC LIMIT 100`
    ).all(from, to) as Record<string, unknown>[];
    for (const r of companies) {
      events.push({
        id: `company-${r.business_id}`,
        date: String(r.created_at).slice(0, 10),
        title: `신규거래처 ${r.name}`,
        erpType: 'company',
        link: `/companies?open=${r.business_id}`,
      });
    }

    // 견적 (quote_date 우선, 없으면 created_at)
    const quotes = db.prepare(
      `SELECT business_id, company_name, quote_date, created_at FROM quotes
       WHERE (quote_date >= ? AND quote_date < ?)
          OR (quote_date IS NULL AND substr(created_at,1,10) >= ? AND substr(created_at,1,10) < ?)
       ORDER BY created_at DESC LIMIT 200`
    ).all(from, to, from, to) as Record<string, unknown>[];
    for (const r of quotes) {
      const date = (r.quote_date ? String(r.quote_date) : String(r.created_at)).slice(0, 10);
      events.push({
        id: `quote-${r.business_id}`,
        date,
        title: `견적 ${r.business_id} ${r.company_name || ''}`.trim(),
        erpType: 'quote',
        link: `/quotes?open=${r.business_id}`,
      });
    }

    // 발주 — order_date / production_due_date / etd
    const pos = db.prepare(
      `SELECT business_id, supplier_name, order_date, production_due_date, etd FROM purchase_orders
       WHERE (order_date >= ? AND order_date < ?)
          OR (production_due_date >= ? AND production_due_date < ?)
          OR (etd >= ? AND etd < ?)
       ORDER BY order_date DESC LIMIT 300`
    ).all(from, to, from, to, from, to) as Record<string, unknown>[];
    for (const r of pos) {
      const sid = String(r.business_id);
      const sup = String(r.supplier_name || '');
      if (r.order_date && String(r.order_date) >= from && String(r.order_date) < to) {
        events.push({ id: `po-${sid}`, date: String(r.order_date).slice(0, 10), title: `발주 ${sid} ${sup}`.trim(), erpType: 'po', link: `/purchase-orders?open=${sid}` });
      }
      if (r.production_due_date && String(r.production_due_date) >= from && String(r.production_due_date) < to) {
        events.push({ id: `po-prod-${sid}`, date: String(r.production_due_date).slice(0, 10), title: `생산완료 ${sid} ${sup}`.trim(), erpType: 'po_production', link: `/purchase-orders?open=${sid}` });
      }
      if (r.etd && String(r.etd) >= from && String(r.etd) < to) {
        events.push({ id: `po-etd-${sid}`, date: String(r.etd).slice(0, 10), title: `ETD(발주) ${sid} ${sup}`.trim(), erpType: 'po_etd', link: `/purchase-orders?open=${sid}` });
      }
    }

    // 선적 — etd / eta
    const shipments = db.prepare(
      `SELECT business_id, pol, pod, etd, eta FROM shipments
       WHERE local_deleted = 0
         AND ((etd >= ? AND etd < ?) OR (eta >= ? AND eta < ?))
       ORDER BY etd DESC LIMIT 100`
    ).all(from, to, from, to) as Record<string, unknown>[];
    for (const r of shipments) {
      const sid = String(r.business_id);
      const route = [r.pol, r.pod].filter(Boolean).join('→');
      if (r.etd && String(r.etd) >= from && String(r.etd) < to) {
        events.push({ id: `ship-etd-${sid}`, date: String(r.etd).slice(0, 10), title: `선적ETD ${sid} ${route}`.trim(), erpType: 'shipment', link: `/shipments?open=${sid}` });
      }
      if (r.eta && String(r.eta) >= from && String(r.eta) < to) {
        events.push({ id: `ship-eta-${sid}`, date: String(r.eta).slice(0, 10), title: `도착ETA ${sid} ${route}`.trim(), erpType: 'shipment_eta', link: `/shipments?open=${sid}` });
      }
    }

    // 매출
    const sales = db.prepare(
      `SELECT business_id, customer, sale_date FROM sales
       WHERE sale_date >= ? AND sale_date < ?
       ORDER BY sale_date DESC LIMIT 100`
    ).all(from, to) as Record<string, unknown>[];
    for (const r of sales) {
      events.push({ id: `sale-${r.business_id}`, date: String(r.sale_date).slice(0, 10), title: `매출 ${r.business_id} ${r.customer || ''}`.trim(), erpType: 'sale', link: `/crm?open=${r.business_id}` });
    }

    // 비용 원장
    const costs = db.prepare(
      `SELECT business_id, description, cost_type, client_name, incurred_date FROM cost_records
       WHERE incurred_date >= ? AND incurred_date < ?
       ORDER BY incurred_date DESC LIMIT 100`
    ).all(from, to) as Record<string, unknown>[];
    for (const r of costs) {
      const label = String(r.description || r.client_name || r.cost_type || r.business_id);
      events.push({ id: `cost-${r.business_id}`, date: String(r.incurred_date).slice(0, 10), title: `비용 ${label}`, erpType: 'cost', link: `/costs?open=${r.business_id}` });
    }

    // 검품
    const inspections = db.prepare(
      `SELECT business_id, product_name, product_name_manual, supplier_name, inspection_date FROM inspections
       WHERE inspection_date >= ? AND inspection_date < ?
       ORDER BY inspection_date DESC LIMIT 100`
    ).all(from, to) as Record<string, unknown>[];
    for (const r of inspections) {
      const pname = String(r.product_name_manual || r.product_name || r.supplier_name || '');
      events.push({ id: `insp-${r.business_id}`, date: String(r.inspection_date).slice(0, 10), title: `검품 ${r.business_id} ${pname}`.trim(), erpType: 'inspection', link: `/inspections?open=${r.business_id}` });
    }

    // 클레임
    const claims = db.prepare(
      `SELECT business_id, customer_name, supplier_name, created_at FROM claims
       WHERE substr(created_at,1,10) >= ? AND substr(created_at,1,10) < ?
       ORDER BY created_at DESC LIMIT 100`
    ).all(from, to) as Record<string, unknown>[];
    for (const r of claims) {
      const party = String(r.customer_name || r.supplier_name || '');
      events.push({ id: `claim-${r.business_id}`, date: String(r.created_at).slice(0, 10), title: `클레임 ${r.business_id} ${party}`.trim(), erpType: 'claim', link: `/claims?open=${r.business_id}` });
    }

    // 지급 (expenses paid_date)
    const expenses = db.prepare(
      `SELECT business_id, description, category, paid_date FROM expenses
       WHERE paid_date IS NOT NULL AND paid_date >= ? AND paid_date < ?
       ORDER BY paid_date DESC LIMIT 100`
    ).all(from, to) as Record<string, unknown>[];
    for (const r of expenses) {
      events.push({ id: `exp-${r.business_id}`, date: String(r.paid_date).slice(0, 10), title: `지급 ${r.description || r.category}`, erpType: 'expense', link: `/costs` });
    }

    events.sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ data: events });
  } catch (e) {
    console.error('[erp-events]', (e as Error).message);
    return NextResponse.json({ data: [], error: (e as Error).message });
  }
}
