import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { dbToRate } from '../route';

interface BulkRow { pol: string; pod: string; containerType: string; totalAmount: number; carrier?: string; rateType?: string; breakdown?: { label: string; amount: number; currency: string }[] }
interface BulkBody {
  forwarderId?: string; forwarderName: string; totalCurrency: string;
  quoteDate?: string; quoteMonth?: string; validUntil?: string; contactPerson?: string; rateType?: string; docNo?: string;
  rows: BulkRow[];
}

/** 엑셀에서 붙여넣은(또는 파일 파싱한) 여러 노선을 한 번에 등록 — 한 문서(포워더 하나·
 * 견적일자 하나·통화 하나) 안에 여러 노선/컨테이너타입 행이 섞여 있는 실제 견적서 구조를
 * 그대로 반영한다.
 *
 * 같은 달(quote_month) 안에서 같은 포워더+노선+컨테이너타입+선사를 다시 올리면 그 달
 * 견적을 덮어쓴다(upsert) — "9월 견적을 올리면 9월 걸로 업데이트, 8월/10월은 별도 이력
 * 으로 남는다"는 요구사항. 키는 (forwarder_id||forwarder_name, pol, pod, container_type,
 * carrier, quote_month). 다른 달 데이터는 절대 건드리지 않는다(append-only는 월 단위로 유지). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json() as BulkBody;

  if (!body.forwarderName?.trim()) return NextResponse.json({ error: '포워더명은 필수입니다.' }, { status: 400 });
  const rows = (body.rows || []).filter(r => r.pol?.trim() && r.pod?.trim() && r.containerType && Number.isFinite(r.totalAmount) && r.totalAmount > 0);
  if (rows.length === 0) return NextResponse.json({ error: '유효한 행이 없습니다(출발항/도착항/운임을 확인하세요).' }, { status: 400 });

  const db = getDb();
  const ts = now();
  const quoteDate = body.quoteDate || null;
  const quoteMonth = body.quoteMonth || (quoteDate ? quoteDate.slice(0, 7) : ts.slice(0, 7));
  const forwarderKey = body.forwarderId || body.forwarderName.trim();

  const findExisting = db.prepare(`SELECT id FROM forwarder_rates
    WHERE COALESCE(forwarder_id, forwarder_name)=? AND pol=? AND pod=? AND container_type=? AND COALESCE(carrier,'')=? AND quote_month=?`);
  const insert = db.prepare(`INSERT INTO forwarder_rates
    (id, forwarder_id, forwarder_name, pol, pod, container_type, carrier, rate_type,
     total_amount, total_currency, breakdown_json, quote_date, quote_month, valid_until, doc_no,
     contact_person, source_file_url, memo, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?)`);
  const update = db.prepare(`UPDATE forwarder_rates SET
    rate_type=?, total_amount=?, total_currency=?, breakdown_json=?, quote_date=?, valid_until=?, doc_no=?,
    contact_person=?, updated_at=? WHERE id=?`);

  const ids = db.transaction(() => {
    const out: string[] = [];
    for (const r of rows) {
      const pol = r.pol.trim().toUpperCase();
      const pod = r.pod.trim().toUpperCase();
      const carrier = r.carrier?.trim() || null;
      const rateType = r.rateType || body.rateType || null;
      const breakdownJson = JSON.stringify(r.breakdown || []);
      const existing = findExisting.get(forwarderKey, pol, pod, r.containerType, carrier || '', quoteMonth) as { id: string } | undefined;
      if (existing) {
        update.run(rateType, r.totalAmount, body.totalCurrency || 'USD', breakdownJson,
          quoteDate, body.validUntil || null, body.docNo || null, body.contactPerson || null, ts, existing.id);
        out.push(existing.id);
      } else {
        const id = newId();
        insert.run(
          id, body.forwarderId || null, body.forwarderName.trim(),
          pol, pod, r.containerType, carrier, rateType,
          r.totalAmount, body.totalCurrency || 'USD', breakdownJson,
          quoteDate, quoteMonth, body.validUntil || null, body.docNo || null,
          body.contactPerson || null, user.id, user.name, ts, ts,
        );
        out.push(id);
      }
    }
    return out;
  })();

  const saved = db.prepare(`SELECT * FROM forwarder_rates WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Record<string, unknown>[];
  return NextResponse.json({ data: saved.map(dbToRate) }, { status: 201 });
}
