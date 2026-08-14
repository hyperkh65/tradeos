import { NextRequest, NextResponse } from 'next/server';

// 현재 주차 계산 (YYYYWW)
function getCurrentWeekCode(): string {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const diff = now.getTime() - start.getTime();
  const week = Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  return `${year}${String(week).padStart(2, '0')}`;
}

// 관세청 UNI-PASS 고시환율 조회
async function fetchCustomsRate(currency: string): Promise<{ rate: number; source: string; weekCode: string } | null> {
  const weekCode = getCurrentWeekCode();
  try {
    const url = `https://unipass.customs.go.kr/csp/myc/apicr/cstmsexrts/retrieveCstmsExrts.do`;
    const params = new URLSearchParams({
      applyYearWeek: weekCode,
      currencyCode: currency,
      pageIndex: '1',
      pageUnit: '20',
    });
    const res = await fetch(`${url}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradeOS/1.0)',
        'Accept': 'application/json, text/html, */*',
        'Referer': 'https://unipass.customs.go.kr',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // JSON 응답에서 환율 추출
    const data = JSON.parse(text);
    const items = data?.cstmsExrtsResponse?.cstmsExrtses ?? data?.items ?? data?.list ?? [];
    const found = items.find((i: Record<string, unknown>) =>
      String(i.currencyCode ?? i.currency_code ?? i.crcyCd ?? '').toUpperCase() === currency.toUpperCase()
    );
    const rate = parseFloat(String(found?.applyExrt ?? found?.exrt ?? found?.rate ?? '0'));
    if (rate > 0) return { rate, source: '관세청 고시환율', weekCode };
  } catch {
    // UNI-PASS 실패 시 다음 방법 시도
  }

  // Fallback: 한국수출입은행 환율 (ECB 기반 공개 API)
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=KRW`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('frankfurter fail');
    const data = await res.json();
    const rate = data?.rates?.KRW;
    if (rate) return { rate: Math.round(rate), source: '참고환율 (ECB 기준)', weekCode };
  } catch { /* ignore */ }

  return null;
}

// 간단한 메모리 캐시 (같은 주차는 재조회 안 함)
const cache: Record<string, { rate: number; source: string; weekCode: string; cachedAt: number }> = {};

export async function GET(req: NextRequest) {
  const currency = (req.nextUrl.searchParams.get('currency') || 'USD').toUpperCase();
  const weekCode = getCurrentWeekCode();
  const cacheKey = `${currency}-${weekCode}`;

  // 1시간 캐시
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.cachedAt < 3600_000) {
    return NextResponse.json({ rate: cached.rate, source: cached.source, weekCode: cached.weekCode, cached: true });
  }

  const result = await fetchCustomsRate(currency);
  if (!result) {
    return NextResponse.json({ error: '환율 조회 실패. 직접 입력해주세요.' }, { status: 503 });
  }

  cache[cacheKey] = { ...result, cachedAt: Date.now() };
  return NextResponse.json({ ...result, cached: false });
}
