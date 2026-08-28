import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { dbToRate } from '../route';

/** 노선(POL/POD) 비교 테이블용 — 포워더/컨테이너타입/선사/요율구분이 같은 것끼리는
 * 그룹으로 묶어 그 중 가장 최근 견적(quote_date 기준) 1건만 남긴다. crm 페이지의
 * getRecentPrice()와 동일한 아이디어를 서버 쿼리 결과에 적용(정렬 후 첫 항목만 채택). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const url = new URL(req.url);
  const pol = url.searchParams.get('pol');
  const pod = url.searchParams.get('pod');
  const containerType = url.searchParams.get('containerType');
  if (!pol || !pod) return NextResponse.json({ error: '출발항과 도착항은 필수입니다.' }, { status: 400 });

  const conds = ['pol=?', 'pod=?'];
  const values: unknown[] = [pol, pod];
  if (containerType) { conds.push('container_type=?'); values.push(containerType); }

  const db = getDb();
  const rows = db.prepare(`SELECT * FROM forwarder_rates WHERE ${conds.join(' AND ')} ORDER BY COALESCE(quote_date, created_at) DESC, created_at DESC`)
    .all(...values) as Record<string, unknown>[];

  const seen = new Set<string>();
  const latest: Record<string, unknown>[] = [];
  for (const r of rows) {
    const key = [r.forwarder_id || r.forwarder_name, r.container_type, r.carrier || '', r.rate_type || ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }

  return NextResponse.json({ data: latest.map(dbToRate) });
}
