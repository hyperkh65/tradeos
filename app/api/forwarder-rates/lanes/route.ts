import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

/** 필터 없이 화면을 처음 열었을 때 "어떤 노선이 등록돼 있는지" 탐색하기 위한 요약 —
 * POL/POD 조합별 등록 건수·포워더 수·가장 최근 견적일자. */
export async function GET(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const db = getDb();
  const rows = db.prepare(`
    SELECT pol, pod,
      COUNT(*) as count,
      COUNT(DISTINCT COALESCE(forwarder_id, forwarder_name)) as forwarderCount,
      MAX(COALESCE(quote_date, created_at)) as lastUpdated
    FROM forwarder_rates
    GROUP BY pol, pod
    ORDER BY lastUpdated DESC
  `).all() as { pol: string; pod: string; count: number; forwarderCount: number; lastUpdated: string }[];

  return NextResponse.json({ data: rows });
}
