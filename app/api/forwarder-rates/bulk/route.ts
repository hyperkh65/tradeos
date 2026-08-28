import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { dbToRate } from '../route';

interface BulkRow { pol: string; pod: string; containerType: string; totalAmount: number; carrier?: string }
interface BulkBody {
  forwarderId?: string; forwarderName: string; totalCurrency: string;
  quoteDate?: string; validUntil?: string; contactPerson?: string; rateType?: string; docNo?: string;
  rows: BulkRow[];
}

/** 엑셀에서 붙여넣은 여러 노선을 한 번에 등록 — 한 문서(포워더 하나·견적일자 하나·통화 하나)
 * 안에 여러 노선/컨테이너타입 행이 섞여 있는 실제 견적서 구조를 그대로 반영한다. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json() as BulkBody;

  if (!body.forwarderName?.trim()) return NextResponse.json({ error: '포워더명은 필수입니다.' }, { status: 400 });
  const rows = (body.rows || []).filter(r => r.pol?.trim() && r.pod?.trim() && r.containerType && Number.isFinite(r.totalAmount) && r.totalAmount > 0);
  if (rows.length === 0) return NextResponse.json({ error: '유효한 행이 없습니다(출발항/도착항/운임을 확인하세요).' }, { status: 400 });

  const db = getDb();
  const ts = now();
  const insert = db.prepare(`INSERT INTO forwarder_rates
    (id, forwarder_id, forwarder_name, pol, pod, container_type, carrier, rate_type,
     total_amount, total_currency, breakdown_json, quote_date, valid_until, doc_no,
     contact_person, source_file_url, memo, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,'[]',?,?,?,?,NULL,NULL,?,?,?,?)`);

  const created = db.transaction(() => {
    const ids: string[] = [];
    for (const r of rows) {
      const id = newId();
      insert.run(
        id, body.forwarderId || null, body.forwarderName.trim(),
        r.pol.trim().toUpperCase(), r.pod.trim().toUpperCase(), r.containerType,
        r.carrier?.trim() || null, body.rateType || null,
        r.totalAmount, body.totalCurrency || 'USD',
        body.quoteDate || null, body.validUntil || null, body.docNo || null,
        body.contactPerson || null, user.id, user.name, ts, ts,
      );
      ids.push(id);
    }
    return ids;
  })();

  const inserted = db.prepare(`SELECT * FROM forwarder_rates WHERE id IN (${created.map(() => '?').join(',')})`).all(...created) as Record<string, unknown>[];
  return NextResponse.json({ data: inserted.map(dbToRate) }, { status: 201 });
}
