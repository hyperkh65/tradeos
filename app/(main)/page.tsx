'use client';

import { AppHeader } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Boxes, Ship, AlertCircle, CheckSquare, FileText, Clock,
  TrendingUp, TrendingDown, Minus, BarChart2, Users, Package,
  ShoppingCart, Star, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';

// ─── helpers ────────────────────────────────────────────────────────────────

const krw = (n: number) => n >= 1_0000_0000
  ? `${(n / 1_0000_0000).toFixed(1)}억`
  : n >= 1_0000
  ? `${(n / 1_0000).toFixed(0)}만`
  : n.toLocaleString();

const fmt = (n: number) => n.toLocaleString();

function DeltaBadge({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return null;
  const pct = ((curr - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={cn('text-xs flex items-center gap-0.5 font-medium', up ? 'text-green-600' : 'text-red-500')}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── types ───────────────────────────────────────────────────────────────────

interface SaleItem { product: string; qty: number; amount: number; unitPrice?: number; }
interface Sale {
  id: string; businessId: string; saleDate: string; customer: string;
  totalAmount: number; netAmount: number; currency: string;
  items?: SaleItem[]; createdAt: string;
}
interface Product {
  id: string; code: string; nameKo: string; supplierName?: string;
  purchasePrice?: number; sellingPrice?: number; currency?: string; created_at?: string;
}

// ─── stat computation ────────────────────────────────────────────────────────

function getMonth(date: string) { return date?.slice(0, 7) ?? ''; }

function computeStats(sales: Sale[]) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const monthlyAmount: Record<string, number> = {};
  const monthlyQty: Record<string, number> = {};
  const customerAmount: Record<string, number> = {};
  const customerQty: Record<string, number> = {};
  const productQty: Record<string, number> = {};
  const productAmount: Record<string, number> = {};

  let totalAmount = 0;
  let totalQty = 0;

  for (const s of sales) {
    const m = getMonth(s.saleDate ?? '');
    const amt = s.totalAmount ?? 0;
    monthlyAmount[m] = (monthlyAmount[m] ?? 0) + amt;
    totalAmount += amt;

    customerAmount[s.customer] = (customerAmount[s.customer] ?? 0) + amt;

    const items: SaleItem[] = Array.isArray(s.items) ? s.items : [];
    for (const it of items) {
      const qty = it.qty ?? 0;
      monthlyQty[m] = (monthlyQty[m] ?? 0) + qty;
      customerQty[s.customer] = (customerQty[s.customer] ?? 0) + qty;
      productQty[it.product] = (productQty[it.product] ?? 0) + qty;
      productAmount[it.product] = (productAmount[it.product] ?? 0) + (it.amount ?? 0);
      totalQty += qty;
    }
  }

  const thisMonthAmount = monthlyAmount[thisMonth] ?? 0;
  const lastMonthAmount = monthlyAmount[lastMonth] ?? 0;
  const thisMonthQty = monthlyQty[thisMonth] ?? 0;
  const lastMonthQty = monthlyQty[lastMonth] ?? 0;

  const trendMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trendMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const trend = trendMonths.map(m => ({ month: m.slice(5), amount: monthlyAmount[m] ?? 0, qty: monthlyQty[m] ?? 0 }));

  const topCustomersByAmount = Object.entries(customerAmount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topCustomersByQty = Object.entries(customerQty).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topProductsByQty = Object.entries(productQty).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topProductsByAmount = Object.entries(productAmount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    thisMonthAmount, lastMonthAmount, thisMonthQty, lastMonthQty,
    totalAmount, totalQty,
    trend, topCustomersByAmount, topCustomersByQty, topProductsByQty, topProductsByAmount,
    totalSalesCount: sales.length,
    thisMonthSalesCount: sales.filter(s => getMonth(s.saleDate ?? '') === thisMonth).length,
  };
}

// ─── mini bar chart ──────────────────────────────────────────────────────────

function MiniBar({ data }: { data: { month: string; amount: number }[] }) {
  const max = Math.max(...data.map(d => d.amount), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => {
        const h = Math.round((d.amount / max) * 100);
        const isLast = i === data.length - 1;
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full rounded-t" style={{ height: `${Math.max(h, 2)}%`, backgroundColor: isLast ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }} />
            <span className="text-[9px] text-muted-foreground">{d.month}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const [userName, setUserName] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [opStats, setOpStats] = useState({ activePOs: 0, upcomingShipments: 0, pendingTasks: 0, pendingApprovals: 0, openClaims: 0, totalCompanies: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => { if (j.user) setUserName(j.user.name); }).catch(() => {});

    Promise.all([
      fetch('/api/sales').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
      fetch('/api/purchase-orders').then(r => r.json()),
      fetch('/api/shipments').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/approvals').then(r => r.json()),
      fetch('/api/claims').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
    ]).then(([saleData, prodData, poData, shpData, taskData, aprData, claimData, compData]) => {
      const saleList: Sale[] = Array.isArray(saleData) ? saleData : (saleData.data ?? []);
      const prodList: Product[] = Array.isArray(prodData) ? prodData : (prodData.data ?? []);
      const poList = Array.isArray(poData) ? poData : (poData.data ?? []);
      const shpList = Array.isArray(shpData) ? shpData : (shpData.data ?? []);
      const taskList = Array.isArray(taskData) ? taskData : (taskData.data ?? []);
      const aprList = Array.isArray(aprData) ? aprData : (aprData.data ?? []);
      const claimList = Array.isArray(claimData) ? claimData : (claimData.data ?? []);
      const compList = Array.isArray(compData) ? compData : (compData.data ?? []);
      setSales(saleList);
      setProducts(prodList);
      setOpStats({
        activePOs: poList.filter((p: any) => !['completed', 'cancelled'].includes(p.status)).length,
        upcomingShipments: shpList.filter((s: any) => !['delivered', 'cancelled'].includes(s.status ?? '')).length,
        pendingTasks: taskList.filter((t: any) => t.status !== '완료').length,
        pendingApprovals: aprList.filter((a: any) => ['대기', '진행중'].includes(a.status ?? '')).length,
        openClaims: claimList.filter((c: any) => !['해결', '종결'].includes(c.status ?? '')).length,
        totalCompanies: compList.length,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const stats = useMemo(() => computeStats(sales), [sales]);
  const recentSales = [...sales].sort((a, b) => (b.saleDate ?? '').localeCompare(a.saleDate ?? '')).slice(0, 6);
  const recentProducts = [...products].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 5);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader />
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">안녕하세요, {userName ? `${userName}님` : '...'}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
          </div>
        </div>

        {/* ── 매출 핵심 지표 ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">매출 현황</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: '이번 달 매출',
                value: `₩${krw(stats.thisMonthAmount)}`,
                sub: `전월 ₩${krw(stats.lastMonthAmount)}`,
                delta: <DeltaBadge curr={stats.thisMonthAmount} prev={stats.lastMonthAmount} />,
                color: 'text-blue-600',
              },
              {
                label: '이번 달 판매수량',
                value: `${fmt(stats.thisMonthQty)}개`,
                sub: `전월 ${fmt(stats.lastMonthQty)}개`,
                delta: <DeltaBadge curr={stats.thisMonthQty} prev={stats.lastMonthQty} />,
                color: 'text-purple-600',
              },
              {
                label: '누적 총 매출',
                value: `₩${krw(stats.totalAmount)}`,
                sub: `총 ${stats.totalSalesCount}건`,
                delta: null,
                color: 'text-green-600',
              },
              {
                label: '이번 달 건수',
                value: `${stats.thisMonthSalesCount}건`,
                sub: `누적 ${fmt(stats.totalQty)}개 판매`,
                delta: null,
                color: 'text-orange-600',
              },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn('text-2xl font-bold mt-1', s.color)}>{loading ? '-' : s.value}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <p className="text-xs text-muted-foreground">{s.sub}</p>
                    {s.delta}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── 운영 현황 ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">운영 현황</p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: '진행 발주', value: opStats.activePOs, href: '/purchase-orders', color: 'text-blue-600' },
              { label: '선적 예정', value: opStats.upcomingShipments, href: '/shipments', color: 'text-green-600' },
              { label: '미완료 업무', value: opStats.pendingTasks, href: '/tasks', color: 'text-purple-600' },
              { label: '결재 대기', value: opStats.pendingApprovals, href: '/approvals', color: 'text-yellow-600' },
              { label: '진행 클레임', value: opStats.openClaims, href: '/claims', color: 'text-red-500' },
              { label: '등록 거래처', value: opStats.totalCompanies, href: '/companies', color: 'text-gray-600' },
            ].map(s => (
              <Link key={s.label} href={s.href}>
                <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                  <CardContent className="p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                    <p className={cn('text-xl font-bold mt-0.5', s.color)}>{loading ? '-' : s.value}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* ── 매출 트렌드 + 최근 매출 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" /> 월별 매출 추이 (최근 6개월)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {!loading && <MiniBar data={stats.trend} />}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {stats.trend.slice(-3).map(d => (
                  <div key={d.month} className="text-center">
                    <p className="text-[10px] text-muted-foreground">{d.month}월</p>
                    <p className="text-xs font-semibold">₩{krw(d.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmt(d.qty)}개</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> 최근 매출
                </CardTitle>
                <Link href="/scm" className="text-xs text-primary hover:underline flex items-center gap-0.5">전체 <ArrowRight className="w-3 h-3" /></Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-1.5">
              {recentSales.map(s => (
                <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.customer}</p>
                    <p className="text-[11px] text-muted-foreground">{s.saleDate}</p>
                  </div>
                  <p className="text-sm font-semibold shrink-0 ml-2">₩{krw(s.totalAmount)}</p>
                </div>
              ))}
              {!loading && recentSales.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">매출 데이터가 없습니다.</p>}
            </CardContent>
          </Card>
        </div>

        {/* ── 누적 1위 업체 (금액 / 수량) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" /> 누적매출 1위 업체 TOP 5
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {stats.topCustomersByAmount.map(([name, amt], i) => {
                const max = stats.topCustomersByAmount[0]?.[1] ?? 1;
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('text-[10px] font-bold w-4 shrink-0', i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-muted-foreground')}>{i + 1}</span>
                        <span className="text-sm truncate">{name}</span>
                      </div>
                      <span className="text-sm font-semibold shrink-0 ml-2">₩{krw(amt)}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(amt / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              {!loading && stats.topCustomersByAmount.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">데이터 없음</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" /> 판매수량 1위 업체 TOP 5
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {stats.topCustomersByQty.map(([name, qty], i) => {
                const max = stats.topCustomersByQty[0]?.[1] ?? 1;
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('text-[10px] font-bold w-4 shrink-0', i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-muted-foreground')}>{i + 1}</span>
                        <span className="text-sm truncate">{name}</span>
                      </div>
                      <span className="text-sm font-semibold shrink-0 ml-2">{fmt(qty)}개</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(qty / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              {!loading && stats.topCustomersByQty.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">데이터 없음</p>}
            </CardContent>
          </Card>
        </div>

        {/* ── 판매 상위 제품 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-green-500" /> 판매수량 TOP 5 제품
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {stats.topProductsByQty.map(([name, qty], i) => {
                const max = stats.topProductsByQty[0]?.[1] ?? 1;
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                        <span className="text-xs truncate">{name}</span>
                      </div>
                      <span className="text-xs font-semibold shrink-0 ml-2">{fmt(qty)}개</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${(qty / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              {!loading && stats.topProductsByQty.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">데이터 없음</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" /> 매출금액 TOP 5 제품
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {stats.topProductsByAmount.map(([name, amt], i) => {
                const max = stats.topProductsByAmount[0]?.[1] ?? 1;
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                        <span className="text-xs truncate">{name}</span>
                      </div>
                      <span className="text-xs font-semibold shrink-0 ml-2">₩{krw(amt)}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(amt / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              {!loading && stats.topProductsByAmount.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">데이터 없음</p>}
            </CardContent>
          </Card>
        </div>

        {/* ── 최근 등록 제품 ── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" /> 최근 등록 제품
              </CardTitle>
              <Link href="/products" className="text-xs text-primary hover:underline flex items-center gap-0.5">전체 <ArrowRight className="w-3 h-3" /></Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {recentProducts.map(p => (
                <div key={p.id} className="border border-border rounded-lg p-3">
                  <p className="text-xs font-mono text-muted-foreground">{p.code}</p>
                  <p className="text-sm font-medium mt-0.5 truncate" title={p.nameKo}>{p.nameKo}</p>
                  {p.supplierName && <p className="text-[11px] text-muted-foreground mt-1 truncate">{p.supplierName}</p>}
                  {p.purchasePrice && (
                    <p className="text-xs font-semibold text-blue-600 mt-1">${p.purchasePrice.toLocaleString()}</p>
                  )}
                </div>
              ))}
              {!loading && recentProducts.length === 0 && <p className="text-xs text-muted-foreground col-span-5 text-center py-4">등록된 제품이 없습니다.</p>}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
