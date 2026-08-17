import { NextRequest, NextResponse } from 'next/server';

// 환율 캐시 (1시간)
let cache: { rates: Record<string, number>; at: number } | null = null;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = (url.searchParams.get('base') || 'USD').toUpperCase();
  const target = (url.searchParams.get('target') || 'KRW').toUpperCase();

  try {
    // 캐시 유효 (1시간)
    if (!cache || Date.now() - cache.at > 3600_000) {
      // fawazahmed0 CDN — 무료, API키 불필요
      const baseLower = base.toLowerCase();
      const res = await fetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${baseLower}.json`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      cache = { rates: data[baseLower] || {}, at: Date.now() };
    }

    const targetLower = target.toLowerCase();
    const rate = cache.rates[targetLower];
    if (!rate) return NextResponse.json({ error: '지원하지 않는 통화' }, { status: 400 });

    // base→target 환율 (예: USD→KRW = 1382)
    return NextResponse.json({ base, target, rate: Math.round(rate), at: new Date().toISOString() });
  } catch (e) {
    console.error('[fx-rate]', e);
    return NextResponse.json({ error: '환율 조회 실패' }, { status: 500 });
  }
}
