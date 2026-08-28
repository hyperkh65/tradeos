import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

/** "이번달 갱신" 진입점 — 지금까지 견적을 등록한 포워더 목록과 마지막 견적일자,
 * 노선(구성) 개수를 보여준다. 사용자가 매번 노선/선사를 새로 입력하지 않고
 * 지난달 구성을 그대로 불러와 금액만 바꿔 넣을 수 있게 하기 위함. */
export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const db = getDb();
  const rows = db.prepare(`
    SELECT forwarder_id as forwarderId, forwarder_name as forwarderName,
      MAX(COALESCE(quote_date, created_at)) as lastQuoteDate,
      MAX(quote_month) as lastQuoteMonth,
      COUNT(DISTINCT pol || '|' || pod || '|' || container_type || '|' || COALESCE(carrier, '')) as laneCount,
      COUNT(*) as totalCount
    FROM forwarder_rates
    GROUP BY forwarder_name
    ORDER BY lastQuoteDate DESC
  `).all() as { forwarderId: string | null; forwarderName: string; lastQuoteDate: string; lastQuoteMonth: string | null; laneCount: number; totalCount: number }[];

  return NextResponse.json({ data: rows });
}
