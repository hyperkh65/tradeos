'use client';

import { AppHeader } from '@/components/layout/header';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';

interface BreakdownItem { label: string; amount: number; currency: string }
interface ForwarderRate {
  id: string; forwarderName: string; pol: string; pod: string; containerType: string;
  carrier?: string; totalAmount: number; totalCurrency: string; breakdown: BreakdownItem[];
  quoteMonth?: string; quoteDate?: string;
}
interface LaneRow {
  key: string; pol: string; pod: string; containerType: string;
  series: { month: string; amount: number }[];
  momPct: number | null;
  competitorBest: { name: string; amount: number } | null;
}

function AnalysisContent() {
  const params = useSearchParams();
  const forwarderName = params.get('forwarderName') || '';
  const [history, setHistory] = useState<ForwarderRate[] | null>(null);
  const [competitorLatest, setCompetitorLatest] = useState<ForwarderRate[]>([]);
  const [fxRates, setFxRates] = useState<Record<string, number>>({ KRW: 1 });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!forwarderName) return;
    fetch(`/api/forwarder-rates/analysis?forwarderName=${encodeURIComponent(forwarderName)}`)
      .then(r => r.json())
      .then(j => { setHistory(j.data?.history || []); setCompetitorLatest(j.data?.competitorLatest || []); });
  }, [forwarderName]);

  useEffect(() => {
    const needed = new Set<string>();
    (history || []).forEach(r => { if (r.totalCurrency !== 'KRW') needed.add(r.totalCurrency); r.breakdown.forEach(b => { if (b.currency !== 'KRW') needed.add(b.currency); }); });
    competitorLatest.forEach(r => { if (r.totalCurrency !== 'KRW') needed.add(r.totalCurrency); r.breakdown.forEach(b => { if (b.currency !== 'KRW') needed.add(b.currency); }); });
    const missing = Array.from(needed).filter(c => !(c in fxRates));
    if (missing.length === 0) return;
    Promise.all(missing.map(c => fetch(`/api/utils/fx-rate?base=${c}&target=KRW`).then(r => r.json()).then(d => [c, d.rate as number] as const).catch(() => [c, 0] as const)))
      .then(pairs => setFxRates(prev => ({ ...prev, ...Object.fromEntries(pairs) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, competitorLatest]);

  const toKrw = (amount: number, currency: string) => Math.round(amount * (fxRates[currency] ?? 0));
  const grandTotal = (r: ForwarderRate) => toKrw(r.totalAmount, r.totalCurrency) + r.breakdown.reduce((s, b) => s + toKrw(b.amount, b.currency), 0);

  const ratesReady = (history || []).every(r => [r.totalCurrency, ...r.breakdown.map(b => b.currency)].every(c => c === 'KRW' || (fxRates[c] ?? 0) > 0))
    && competitorLatest.every(r => [r.totalCurrency, ...r.breakdown.map(b => b.currency)].every(c => c === 'KRW' || (fxRates[c] ?? 0) > 0));

  const laneRows: LaneRow[] = useMemo(() => {
    if (!ratesReady || !history) return [];
    const lanes = new Map<string, { pol: string; pod: string; containerType: string; monthly: Map<string, number> }>();
    for (const r of history) {
      if (!r.quoteMonth) continue;
      const key = `${r.pol}|${r.pod}|${r.containerType}`;
      if (!lanes.has(key)) lanes.set(key, { pol: r.pol, pod: r.pod, containerType: r.containerType, monthly: new Map() });
      const lane = lanes.get(key)!;
      const total = grandTotal(r);
      // 같은 달에 여러 선사가 있으면 그 중 최저가를 그 달의 대표값으로 채택
      // — "경쟁력 있는 노선"을 보려는 목적에 맞게 항상 최선의 선택지 기준으로 추이를 그림.
      const existing = lane.monthly.get(r.quoteMonth);
      if (existing === undefined || total < existing) lane.monthly.set(r.quoteMonth, total);
    }
    const rows: LaneRow[] = [];
    for (const [key, lane] of lanes) {
      const months = Array.from(lane.monthly.keys()).sort();
      const series = months.map(m => ({ month: m, amount: lane.monthly.get(m)! }));
      const latest = series[series.length - 1];
      const prev = series.length >= 2 ? series[series.length - 2] : null;
      const momPct = prev && prev.amount > 0 ? ((latest.amount - prev.amount) / prev.amount) * 100 : null;
      const competitors = competitorLatest.filter(c => c.pol === lane.pol && c.pod === lane.pod && c.containerType === lane.containerType);
      let competitorBest: { name: string; amount: number } | null = null;
      for (const c of competitors) {
        const amt = grandTotal(c);
        if (!competitorBest || amt < competitorBest.amount) competitorBest = { name: c.forwarderName, amount: amt };
      }
      rows.push({ key, pol: lane.pol, pod: lane.pod, containerType: lane.containerType, series, momPct, competitorBest });
    }
    return rows.sort((a, b) => a.pol.localeCompare(b.pol) || a.pod.localeCompare(b.pod) || a.containerType.localeCompare(b.containerType));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, competitorLatest, fxRates, ratesReady]);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title={`${forwarderName || '포워더'} 종합분석`} icon={<TrendingUp className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <Link href="/forwarder-rates" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />포워더운임 목록으로
        </Link>

        {!history || !ratesReady ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : laneRows.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-8 text-center">이 포워더의 견적 이력이 없습니다.</p>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">노선</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">타입</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">최신 최저가(원화)</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">전월 대비</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">경쟁사 대비</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {laneRows.map(row => {
                  const latest = row.series[row.series.length - 1];
                  const isExpanded = expanded === row.key;
                  const diffFromCompetitor = row.competitorBest ? latest.amount - row.competitorBest.amount : null;
                  return (
                    <>
                      <tr key={row.key} className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : row.key)}>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">{row.pol} → {row.pod}</td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{row.containerType}</td>
                        <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">₩{latest.amount.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {row.momPct === null ? (
                            <span className="text-muted-foreground text-xs">이전 데이터 없음</span>
                          ) : (
                            <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium',
                              row.momPct > 0.5 ? 'text-red-600' : row.momPct < -0.5 ? 'text-green-600' : 'text-muted-foreground')}>
                              {row.momPct > 0.5 ? <TrendingUp className="w-3 h-3" /> : row.momPct < -0.5 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                              {row.momPct > 0 ? '+' : ''}{row.momPct.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {!row.competitorBest ? (
                            <span className="text-xs text-muted-foreground">비교 대상 없음</span>
                          ) : diffFromCompetitor !== null && diffFromCompetitor <= 0 ? (
                            <span className="text-xs font-medium text-green-700 bg-green-50 rounded-full px-2 py-0.5">
                              {row.competitorBest.name} 대비 ₩{Math.abs(diffFromCompetitor).toLocaleString()} 저렴(경쟁력 우위)
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-red-700 bg-red-50 rounded-full px-2 py-0.5">
                              {row.competitorBest.name} 대비 ₩{diffFromCompetitor?.toLocaleString()} 비쌈
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${row.key}-chart`}>
                          <td colSpan={6} className="px-3 pb-4 pt-1 bg-muted/20">
                            {row.series.length < 2 ? (
                              <p className="text-xs text-muted-foreground py-4 text-center">추이를 그리려면 2개월 이상의 견적 이력이 필요합니다(현재 {row.series.length}개월).</p>
                            ) : (
                              <div style={{ width: '100%', height: 180 }}>
                                <ResponsiveContainer>
                                  <LineChart data={row.series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₩${(v / 10000).toFixed(0)}만`} width={56} />
                                    <Tooltip formatter={(v) => [`₩${Number(v).toLocaleString()}`, '총 운임']} labelFormatter={l => `${l} 견적`} />
                                    <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ForwarderAnalysisPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
      <AnalysisContent />
    </Suspense>
  );
}
