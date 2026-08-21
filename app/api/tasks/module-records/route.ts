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
           WHERE (local_deleted IS NULL OR local_deleted=0)
           ORDER BY created_at DESC LIMIT 200`
        ).all() as { business_id: string; company_name: string; status: string; created_at: string }[];
        rows = data.map(r => ({
          id: r.business_id, businessId: r.business_id,
          label: `견적 ${r.business_id}`, sub: r.company_name,
          status: r.status, date: r.created_at?.slice(0, 10),
        }));
        break;
      }
      case 'sale': {
        const data = db.prepare(
          `SELECT business_id, customer, sale_date, created_at FROM sales
           ORDER BY created_at DESC LIMIT 200`
        ).all() as { business_id: string; customer: string; sale_date: string; created_at: string }[];
        rows = data.map(r => ({
          id: r.business_id, businessId: r.business_id,
          label: `매출 ${r.business_id}`, sub: r.customer,
          date: r.sale_date?.slice(0, 10),
        }));
        break;
      }
      case 'po': {
        const data = db.prepare(
          `SELECT business_id, supplier_name, status, order_date FROM purchase_orders
           WHERE (local_deleted IS NULL OR local_deleted=0)
           ORDER BY created_at DESC LIMIT 200`
        ).all() as { business_id: string; supplier_name: string; status: string; order_date: string }[];
        rows = data.map(r => ({
          id: r.business_id, businessId: r.business_id,
          label: `발주 ${r.business_id}`, sub: r.supplier_name,
          status: r.status, date: r.order_date?.slice(0, 10),
        }));
        break;
      }
      case 'shipment': {
        const data = db.prepare(
          `SELECT business_id, forwarder_name, pol, pod, etd, status FROM shipments
           WHERE (local_deleted IS NULL OR local_deleted=0)
           ORDER BY created_at DESC LIMIT 200`
        ).all() as { business_id: string; forwarder_name: string; pol: string; pod: string; etd: string; status: string }[];
        rows = data.map(r => ({
          id: r.business_id, businessId: r.business_id,
          label: `선적 ${r.business_id}`, sub: [r.pol, r.pod].filter(Boolean).join(' → ') || r.forwarder_name,
          status: r.status, date: r.etd?.slice(0, 10),
        }));
        break;
      }
      case 'claim': {
        const data = db.prepare(
          `SELECT business_id, customer_name, supplier_name, status, created_at FROM claims
           WHERE (local_deleted IS NULL OR local_deleted=0)
           ORDER BY created_at DESC LIMIT 200`
        ).all() as { business_id: string; customer_name: string; supplier_name: string; status: string; created_at: string }[];
        rows = data.map(r => ({
          id: r.business_id, businessId: r.business_id,
          label: `클레임 ${r.business_id}`, sub: r.customer_name || r.supplier_name,
          status: r.status, date: r.created_at?.slice(0, 10),
        }));
        break;
      }
      case 'company': {
        const data = db.prepare(
          `SELECT business_id, name, type, country FROM companies
           ORDER BY updated_at DESC LIMIT 200`
        ).all() as { business_id: string; name: string; type: string; country: string }[];
        rows = data.map(r => ({
          id: r.business_id, businessId: r.business_id,
          label: r.name, sub: `${r.type} · ${r.country}`,
        }));
        break;
      }
      case 'contract': {
        // approvals 테이블 활용 (계약 문서)
        const data = db.prepare(
          `SELECT business_id, title, status, created_at FROM approvals
           ORDER BY created_at DESC LIMIT 200`
        ).all() as { business_id: string; title: string; status: string; created_at: string }[];
        rows = data.map(r => ({
          id: r.business_id, businessId: r.business_id,
          label: r.business_id, sub: r.title,
          status: r.status, date: r.created_at?.slice(0, 10),
        }));
        break;
      }
      default:
        return NextResponse.json({ data: [] });
    }

    // 검색어 필터
    if (q) {
      rows = rows.filter(r =>
        r.businessId.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        r.sub?.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ data: rows.slice(0, 50) });
  } catch (e) {
    console.error('[module-records]', (e as Error).message);
    return NextResponse.json({ data: [] });
  }
}
