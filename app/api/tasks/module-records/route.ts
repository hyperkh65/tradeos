import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

interface ModuleRecord {
  id: string;
  businessId: string;
  label: string;
  sub: string;
  status?: string;
  date?: string;
}

type RawRow = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const module = searchParams.get('module') || '';
  const q = (searchParams.get('q') || '').toLowerCase();

  const db = getDb();
  let rows: ModuleRecord[] = [];

  try {
    switch (module) {
      case 'quote': {
        const data = db.prepare(
          `SELECT business_id, company_name, status, created_at FROM quotes
           ORDER BY created_at DESC LIMIT 200`
        ).all() as RawRow[];
        rows = data.map(r => ({
          id: String(r.business_id), businessId: String(r.business_id),
          label: `견적 ${r.business_id}`, sub: String(r.company_name || ''),
          status: String(r.status || ''), date: String(r.created_at || '').slice(0, 10),
        }));
        break;
      }
      case 'sale': {
        const data = db.prepare(
          `SELECT business_id, customer, sale_date, created_at FROM sales
           ORDER BY created_at DESC LIMIT 200`
        ).all() as RawRow[];
        rows = data.map(r => ({
          id: String(r.business_id), businessId: String(r.business_id),
          label: `매출 ${r.business_id}`, sub: String(r.customer || ''),
          date: String(r.sale_date || '').slice(0, 10),
        }));
        break;
      }
      case 'po': {
        const data = db.prepare(
          `SELECT business_id, supplier_name, status, order_date FROM purchase_orders
           ORDER BY created_at DESC LIMIT 200`
        ).all() as RawRow[];
        rows = data.map(r => ({
          id: String(r.business_id), businessId: String(r.business_id),
          label: `발주 ${r.business_id}`, sub: String(r.supplier_name || ''),
          status: String(r.status || ''), date: String(r.order_date || '').slice(0, 10),
        }));
        break;
      }
      case 'shipment': {
        const data = db.prepare(
          `SELECT business_id, forwarder_name, pol, pod, etd, status FROM shipments
           WHERE local_deleted = 0
           ORDER BY created_at DESC LIMIT 200`
        ).all() as RawRow[];
        rows = data.map(r => ({
          id: String(r.business_id), businessId: String(r.business_id),
          label: `선적 ${r.business_id}`,
          sub: [r.pol, r.pod].filter(Boolean).join(' → ') || String(r.forwarder_name || ''),
          status: String(r.status || ''), date: String(r.etd || '').slice(0, 10),
        }));
        break;
      }
      case 'claim': {
        const data = db.prepare(
          `SELECT business_id, customer_name, supplier_name, status, created_at FROM claims
           ORDER BY created_at DESC LIMIT 200`
        ).all() as RawRow[];
        rows = data.map(r => ({
          id: String(r.business_id), businessId: String(r.business_id),
          label: `클레임 ${r.business_id}`,
          sub: String(r.customer_name || r.supplier_name || ''),
          status: String(r.status || ''), date: String(r.created_at || '').slice(0, 10),
        }));
        break;
      }
      case 'inspection': {
        const data = db.prepare(
          `SELECT business_id, supplier_name, product_name, result, inspection_date FROM inspections
           ORDER BY created_at DESC LIMIT 200`
        ).all() as RawRow[];
        rows = data.map(r => ({
          id: String(r.business_id), businessId: String(r.business_id),
          label: `검품 ${r.business_id}`,
          sub: String(r.product_name || r.supplier_name || ''),
          status: String(r.result || ''), date: String(r.inspection_date || '').slice(0, 10),
        }));
        break;
      }
      case 'cost': {
        const data = db.prepare(
          `SELECT business_id, cost_type, description, client_name, incurred_date, disposition FROM cost_records
           ORDER BY created_at DESC LIMIT 200`
        ).all() as RawRow[];
        rows = data.map(r => ({
          id: String(r.business_id), businessId: String(r.business_id),
          label: `비용 ${r.business_id}`,
          sub: String(r.description || r.client_name || r.cost_type || ''),
          status: String(r.disposition || ''), date: String(r.incurred_date || '').slice(0, 10),
        }));
        break;
      }
      case 'company': {
        const data = db.prepare(
          `SELECT business_id, name, type, country FROM companies
           ORDER BY updated_at DESC LIMIT 200`
        ).all() as RawRow[];
        rows = data.map(r => ({
          id: String(r.business_id), businessId: String(r.business_id),
          label: String(r.name || ''), sub: `${r.type} · ${r.country}`,
        }));
        break;
      }
      default:
        return NextResponse.json({ data: [] });
    }

    if (q) {
      rows = rows.filter(r =>
        r.businessId.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        (r.sub || '').toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ data: rows.slice(0, 50) });
  } catch (e) {
    console.error('[module-records]', module, (e as Error).message);
    return NextResponse.json({ data: [], error: (e as Error).message });
  }
}
