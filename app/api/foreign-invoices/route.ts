import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export interface ForeignInvoiceItem {
  costRecordId?: string; description: string; amount: number; currency: string;
}

export interface ForeignInvoice {
  id: string; businessId: string;
  clientId?: string; clientName?: string;
  currency: string; subtotal: number; total: number;
  items: ForeignInvoiceItem[];
  issuedDate?: string; dueDate?: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  fxRateAtPayment?: number; paidAmountKrw?: number; paidAt?: string;
  remark?: string; createdBy?: string; createdAt: string; updatedAt?: string;
}

export function dbToFI(row: Record<string, unknown>): ForeignInvoice {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    clientId: (row.client_id as string) || undefined,
    clientName: (row.client_name as string) || undefined,
    currency: (row.currency as string) || 'USD',
    subtotal: (row.subtotal as number) || 0,
    total: (row.total as number) || 0,
    items: (() => { try { return JSON.parse((row.items_json as string) || '[]'); } catch { return []; } })(),
    issuedDate: (row.issued_date as string) || undefined,
    dueDate: (row.due_date as string) || undefined,
    status: (row.status as ForeignInvoice['status']) || 'draft',
    fxRateAtPayment: (row.fx_rate_at_payment as number) || undefined,
    paidAmountKrw: (row.paid_amount_krw as number) || undefined,
    paidAt: (row.paid_at as string) || undefined,
    remark: (row.remark as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) || undefined,
  };
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId');
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM foreign_invoices WHERE 1=1';
  const params: unknown[] = [];
  if (clientId) { query += ' AND client_id=?'; params.push(clientId); }
  if (status) { query += ' AND status=?'; params.push(status); }
  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(dbToFI) });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const bizId = nextBizId('INV');
    const ts = now();

    const items: ForeignInvoiceItem[] = body.items || [];
    const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
    const total = subtotal;

    db.prepare(`INSERT INTO foreign_invoices
      (id,business_id,client_id,client_name,currency,subtotal,total,items_json,
       issued_date,due_date,status,remark,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id, bizId,
        body.clientId ?? null, body.clientName ?? null,
        body.currency || 'USD', subtotal, total,
        JSON.stringify(items),
        body.issuedDate ?? ts.slice(0, 10),
        body.dueDate ?? null,
        body.status || 'draft',
        body.remark ?? null,
        user?.id || 'unknown', ts, ts,
      );

    // 연결된 cost_records 상태 업데이트
    for (const item of items) {
      if (item.costRecordId) {
        db.prepare("UPDATE cost_records SET linked_invoice_id=?, bill_status='invoiced', updated_at=? WHERE id=?")
          .run(id, ts, item.costRecordId);
      }
    }

    const row = db.prepare('SELECT * FROM foreign_invoices WHERE id=?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToFI(row) }, { status: 201 });
  } catch (e) {
    console.error('[foreign-invoices POST]', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
