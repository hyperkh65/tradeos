import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/sqlite';

/** 관리자가 "왜 사용량이 빠르게 소진되는지" 확인할 수 있게, 최근 24시간 요청 유형별
 * 집계를 보여준다(ai_usage_logs — router.ts/rerank.ts가 매 provider 호출마다 기록). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`
    SELECT request_type, success, COUNT(*) as n, AVG(latency_ms) as avgLatencyMs, SUM(rag_chunks) as totalRagChunks
    FROM ai_usage_logs WHERE created_at > ? GROUP BY request_type, success
  `).all(since) as { request_type: string; success: number; n: number; avgLatencyMs: number | null; totalRagChunks: number | null }[];

  const fallbackCount = (db.prepare(`SELECT COUNT(*) as n FROM ai_usage_logs WHERE created_at > ? AND fallback_from_provider_id IS NOT NULL`).get(since) as { n: number }).n;

  return NextResponse.json({
    data: {
      sinceHours: 24,
      byType: rows.map(r => ({ requestType: r.request_type, success: !!r.success, count: r.n, avgLatencyMs: r.avgLatencyMs ? Math.round(r.avgLatencyMs) : null, totalRagChunks: r.totalRagChunks ?? 0 })),
      fallbackCount,
    },
  });
}
