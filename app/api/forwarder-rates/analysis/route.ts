import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { dbToRate } from '../route';

/** 포워더별 종합분석 페이지용 — 해당 포워더의 전체 월별 이력(history)과, 같은 노선·
 * 컨테이너타입에 대한 다른 포워더들의 최신 견적(competitorLatest)을 함께 돌려준다.
 * 원화 환산·추이 계산은 클라이언트에서 한다(메인 비교 화면과 동일한 당일 환율 방식을
 * 그대로 재사용해서 계산 로직이 두 곳에서 따로 놀지 않게 함). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const forwarderName = req.nextUrl.searchParams.get('forwarderName');
  if (!forwarderName) return NextResponse.json({ error: '포워더명은 필수입니다.' }, { status: 400 });

  const db = getDb();
  const history = db.prepare(`
    SELECT * FROM forwarder_rates WHERE forwarder_name=? ORDER BY quote_month ASC, created_at ASC
  `).all(forwarderName) as Record<string, unknown>[];

  const rest = db.prepare(`
    SELECT * FROM forwarder_rates WHERE forwarder_name<>?
    ORDER BY COALESCE(quote_date, created_at) DESC, created_at DESC
  `).all(forwarderName) as Record<string, unknown>[];
  const seen = new Set<string>();
  const competitorLatest: Record<string, unknown>[] = [];
  for (const r of rest) {
    // carrier까지 키에 포함 — 안 그러면 경쟁사가 같은 노선에 선사를 여러 개
    // 견적했을 때 그 중 임의의 한 선사만 남아 실제 최저가가 누락되고,
    // 프론트의 "경쟁사 중 최저가" 계산이 이미 걸러진 데이터로 왜곡됨.
    const key = [r.forwarder_name, r.pol, r.pod, r.container_type, r.carrier].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    competitorLatest.push(r);
  }

  return NextResponse.json({
    data: { forwarderName, history: history.map(dbToRate), competitorLatest: competitorLatest.map(dbToRate) },
  });
}
