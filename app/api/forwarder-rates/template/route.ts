import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

interface TemplateRow { pol: string; pod: string; rate20: string; rate40: string; carrier: string }

/** 특정 포워더의 "가장 최근 견적 묶음"(같은 견적일자로 등록된 행들)을 그리드 모양으로
 * 돌려준다 — "이번달 갱신"이 이 결과를 그대로 프리필해서, 노선·컨테이너타입·선사를
 * 다시 입력하지 않고 금액만 새로 채워 넣게 하기 위함. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const url = new URL(req.url);
  const forwarderName = url.searchParams.get('forwarderName');
  if (!forwarderName) return NextResponse.json({ error: '포워더명은 필수입니다.' }, { status: 400 });

  const db = getDb();
  const latest = db.prepare(`SELECT MAX(COALESCE(quote_date, created_at)) as d FROM forwarder_rates WHERE forwarder_name=?`).get(forwarderName) as { d: string | null };
  if (!latest?.d) return NextResponse.json({ data: null });

  const rows = db.prepare(`
    SELECT * FROM forwarder_rates
    WHERE forwarder_name=? AND COALESCE(quote_date, created_at)=?
    ORDER BY pol, pod, carrier, container_type
  `).all(forwarderName, latest.d) as Record<string, unknown>[];
  if (rows.length === 0) return NextResponse.json({ data: null });

  const grid = new Map<string, TemplateRow>();
  for (const r of rows) {
    const key = `${r.pol}|${r.pod}|${r.carrier || ''}`;
    if (!grid.has(key)) grid.set(key, { pol: r.pol as string, pod: r.pod as string, carrier: (r.carrier as string) || '', rate20: '', rate40: '' });
    const row = grid.get(key)!;
    if (r.container_type === '20GP') row.rate20 = String(r.total_amount);
    if (r.container_type === '40GP') row.rate40 = String(r.total_amount);
  }

  const first = rows[0];
  return NextResponse.json({
    data: {
      forwarderId: first.forwarder_id || undefined,
      totalCurrency: first.total_currency,
      validUntil: first.valid_until || '',
      contactPerson: first.contact_person || '',
      previousQuoteDate: latest.d,
      rows: Array.from(grid.values()),
    },
  });
}
