'use client';

import { AppHeader } from '@/components/layout/header';
import {
  Boxes, Ship, AlertCircle, CheckSquare, FileText, Clock,
  TrendingUp, TrendingDown, BarChart2, Users, Package,
  ShoppingCart, ArrowRight, Zap, Target, Repeat2, PieChart, Truck as TruckIcon,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';

// ─── formatters ──────────────────────────────────────────────────────────────

const krw = (n: number) =>
  n >= 1_0000_0000 ? `${(n / 1_0000_0000).toFixed(1)}억`
  : n >= 1_0000 ? `${Math.round(n / 1_0000)}만`
  : n.toLocaleString();

const fmt = (n: number) => n.toLocaleString();

const RANK_COLORS = [
  'from-yellow-400 to-amber-500',
  'from-gray-300 to-gray-400',
  'from-orange-400 to-amber-600',
  'from-blue-300 to-blue-400',
  'from-blue-200 to-blue-300',
];
const RANK_TEXT = ['text-yellow-600', 'text-gray-400', 'text-orange-500', 'text-muted-foreground', 'text-muted-foreground'];

const TYPE_COLORS: Record<string, string> = {
  '일반': 'bg-blue-500', '직수출': 'bg-green-500', '내수': 'bg-purple-500',
  '샘플': 'bg-orange-400', '반품': 'bg-red-400',
};
const TYPE_TEXT_COLORS: Record<string, string> = {
  '일반': 'text-blue-600', '직수출': 'text-green-600', '내수': 'text-purple-600',
  '샘플': 'text-orange-500', '반품': 'text-red-500',
};

// ─── types ───────────────────────────────────────────────────────────────────

interface SaleItem { product: string; qty: number; amount: number; unitPrice?: number; }
interface Sale {
  id: string; businessId: string; saleDate: string; customer: string;
  totalAmount: number; netAmount: number; currency: string; saleType?: string;
  items?: SaleItem[];
}
interface Product {
  id: string; code: string; nameKo: string; supplierName?: string;
  purchasePrice?: number; sellingPrice?: number; created_at?: string;
}

// ─── stat computation ─────────────────────────────────────────────────────────

function getMonth(d: string) { return d?.slice(0, 7) ?? ''; }

function computeStats(sales: Sale[], allSales: Sale[]) {
  const now = new Date();
  const curYear = now.getFullYear();
  const thisMonth = `${curYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(curYear, now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const monthlyAmount: Record<string, number> = {};
  const monthlyQty: Record<string, number> = {};
  const customerAmount: Record<string, number> = {};
  const customerTxCount: Record<string, number> = {};
  const productQty: Record<string, number> = {};
  const productAmount: Record<string, number> = {};
  const saleTypeAmount: Record<string, number> = {};
  let totalAmount = 0, totalQty = 0;

  for (const s of sales) {
    const m = getMonth(s.saleDate ?? '');
    const amt = s.totalAmount ?? 0;
    monthlyAmount[m] = (monthlyAmount[m] ?? 0) + amt;
    totalAmount += amt;
    customerAmount[s.customer] = (customerAmount[s.customer] ?? 0) + amt;
    customerTxCount[s.customer] = (customerTxCount[s.customer] ?? 0) + 1;
    const type = s.saleType || '일반';
    saleTypeAmount[type] = (saleTypeAmount[type] ?? 0) + amt;

    for (const it of (s.items ?? [])) {
      const qty = it.qty ?? 0;
      monthlyQty[m] = (monthlyQty[m] ?? 0) + qty;
      productQty[it.product] = (productQty[it.product] ?? 0) + qty;
      productAmount[it.product] = (productAmount[it.product] ?? 0) + (it.amount ?? 0);
      totalQty += qty;
    }
  }

  // YoY: same period last year
  const prevYearSales = allSales.filter(s => (s.saleDate ?? '').startsWith(String(curYear - 1)));
  const prevYearAmount = prevYearSales.reduce((s, r) => s + (r.totalAmount ?? 0), 0);

  // trend: 6 months
  const trendMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(curYear, now.getMonth() - i, 1);
    trendMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const trend = trendMonths.map(m => ({ month: m.slice(5), amount: monthlyAmount[m] ?? 0, qty: monthlyQty[m] ?? 0 }));

  return {
    thisMonthAmount: monthlyAmount[thisMonth] ?? 0,
    lastMonthAmount: monthlyAmount[lastMonth] ?? 0,
    thisMonthQty: monthlyQty[thisMonth] ?? 0,
    lastMonthQty: monthlyQty[lastMonth] ?? 0,
    totalAmount, totalQty,
    prevYearAmount,
    trend,
    topCustomersByAmount: Object.entries(customerAmount).sort((a, b) => b[1] - a[1]).slice(0, 5),
    topCustomersByTx: Object.entries(customerTxCount).sort((a, b) => b[1] - a[1]).slice(0, 5),
    topProductsByAmount: Object.entries(productAmount).sort((a, b) => b[1] - a[1]).slice(0, 5),
    topProductsByQty: Object.entries(productQty).sort((a, b) => b[1] - a[1]).slice(0, 5),
    saleTypeDistribution: Object.entries(saleTypeAmount).sort((a, b) => b[1] - a[1]),
    totalSalesCount: sales.length,
    thisMonthSalesCount: sales.filter(s => getMonth(s.saleDate ?? '') === thisMonth).length,
  };
}

// ─── components ──────────────────────────────────────────────────────────────

function Delta({ curr, prev }: { curr: number; prev: number }) {
  if (!prev || !curr) return null;
  const pct = ((curr - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full', up ? 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400' : 'bg-red-50 text-red-500 dark:bg-red-950 dark:text-red-400')}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function TrendBar({ data }: { data: { month: string; amount: number }[] }) {
  const max = Math.max(...data.map(d => d.amount), 1);
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="flex items-end gap-1.5 h-20">
      {data.map((d, i) => {
        const h = Math.max((d.amount / max) * 100, 2);
        const isLast = i === data.length - 1;
        return (
          <div
            key={d.month}
            className="flex-1 flex flex-col items-center gap-1.5 group relative"
            onClick={() => setActive(active === i ? null : i)}
            onTouchStart={() => setActive(i)}
          >
            <div className={cn(
              'absolute -top-7 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity whitespace-nowrap shadow-sm z-10',
              active === i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}>
              ₩{krw(d.amount)}
            </div>
            <div className="w-full rounded-t-sm transition-all" style={{
              height: `${h}%`,
              background: isLast
                ? 'linear-gradient(to top, hsl(var(--primary)), hsl(var(--primary)/0.7))'
                : 'hsl(var(--muted))',
            }} />
            <span className="text-[9px] text-muted-foreground">{d.month}월</span>
          </div>
        );
      })}
    </div>
  );
}

function RankBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

function SectionTitle({ icon: Icon, label, color = 'text-primary' }: { icon: React.ElementType; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={cn('p-1.5 rounded-lg bg-muted/60', color)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

function RankCard({ title, icon: Icon, iconColor, items, valueLabel, barColor }: {
  title: string; icon: React.ElementType; iconColor: string;
  items: [string, number][]; valueLabel: (v: number) => string; barColor: string;
}) {
  const max = items[0]?.[1] ?? 1;
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <SectionTitle icon={Icon} label={title} color={iconColor} />
      <div className="space-y-3">
        {items.map(([name, val], i) => (
          <div key={name}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn('text-[11px] font-bold w-5 shrink-0 text-center', RANK_TEXT[i])}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <span className="text-sm truncate text-foreground/90">{name}</span>
              </div>
              <span className="text-sm font-semibold shrink-0 ml-2 tabular-nums">{valueLabel(val)}</span>
            </div>
            <RankBar value={val} max={max} color={barColor} />
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">데이터 없음</p>}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const curYear = new Date().getFullYear();

  const [userName, setUserName] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [opStats, setOpStats] = useState({ activePOs: 0, upcomingShipments: 0, pendingTasks: 0, pendingApprovals: 0, openClaims: 0, totalCompanies: 0, pendingCustoms: 0 });
  const [thisMonthTax, setThisMonthTax] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'year' | 'all'>('year');

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
      fetch('/api/imports').then(r => r.json()),
    ]).then(([sRes, pRes, poRes, shRes, tRes, aRes, cRes, coRes, imRes]) => {
      setSales(Array.isArray(sRes.data) ? sRes.data : []);
      setProducts(Array.isArray(pRes.data) ? pRes.data : []);
      const po = Array.isArray(poRes.data) ? poRes.data : [];
      const sh = Array.isArray(shRes.data) ? shRes.data : [];
      const tk = Array.isArray(tRes.data) ? tRes.data : [];
      const ap = Array.isArray(aRes.data) ? aRes.data : [];
      const cl = Array.isArray(cRes.data) ? cRes.data : [];
      const co = Array.isArray(coRes.data) ? coRes.data : [];
      const im = Array.isArray(imRes.data) ? imRes.data : [];
      const thisMonth = new Date().toISOString().slice(0, 7);
      const monthTax = im
        .filter((i: any) => (i.declarationDate || i.createdAt || '').startsWith(thisMonth))
        .reduce((s: number, i: any) => s + (i.duty || 0) + (i.vat || 0), 0);
      setThisMonthTax(monthTax);
      setOpStats({
        activePOs: po.filter((p: any) => !['completed', 'cancelled'].includes(p.status)).length,
        upcomingShipments: sh.filter((s: any) => !['delivered', 'cancelled'].includes(s.status ?? '')).length,
        pendingTasks: tk.filter((t: any) => t.status !== '완료').length,
        pendingApprovals: ap.filter((a: any) => ['대기', '진행중'].includes(a.status ?? '')).length,
        openClaims: cl.filter((c: any) => !['해결', '종결'].includes(c.status ?? '')).length,
        totalCompanies: co.length,
        pendingCustoms: im.filter((i: any) => i.status !== 'completed').length,
      });
    }).finally(() => setLoading(false));
  }, []);

  const filteredSales = useMemo(() => {
    if (filterMode === 'all') return sales;
    return sales.filter(s => (s.saleDate ?? '').startsWith(String(curYear)));
  }, [sales, filterMode, curYear]);

  const stats = useMemo(() => computeStats(filteredSales, sales), [filteredSales, sales]);

  const recentSales = [...sales].sort((a, b) => (b.saleDate ?? '').localeCompare(a.saleDate ?? '')).slice(0, 6);
  const recentProducts = [...products].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 5);

  const opItems = [
    { label: '진행 발주', value: opStats.activePOs, href: '/purchase-orders', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400', icon: FileText },
    { label: '선적 예정', value: opStats.upcomingShipments, href: '/shipments', bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-600 dark:text-green-400', icon: Ship },
    { label: '통관 진행', value: opStats.pendingCustoms, href: '/imports', bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400', icon: Clock },
    { label: '미완료 업무', value: opStats.pendingTasks, href: '/tasks', bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-600 dark:text-purple-400', icon: CheckSquare },
    { label: '결재 대기', value: opStats.pendingApprovals, href: '/approvals', bg: 'bg-yellow-50 dark:bg-yellow-950/30', text: 'text-yellow-600 dark:text-yellow-400', icon: AlertCircle },
    { label: '진행 클레임', value: opStats.openClaims, href: '/claims', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-500 dark:text-red-400', icon: Zap },
    { label: '등록 거래처', value: opStats.totalCompanies, href: '/companies', bg: 'bg-gray-50 dark:bg-gray-950/30', text: 'text-gray-600 dark:text-gray-400', icon: Boxes },
  ];

  const kpiCards = [
    {
      label: '이달 매출',
      value: loading ? '-' : `₩${krw(stats.thisMonthAmount)}`,
      sub: `전월 ₩${krw(stats.lastMonthAmount)}`,
      badge: <Delta curr={stats.thisMonthAmount} prev={stats.lastMonthAmount} />,
      border: 'border-l-blue-500',
      icon: TrendingUp,
      iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
    },
    {
      label: filterMode === 'year' ? `${curYear}년 누적 매출` : '전체 누적 매출',
      value: loading ? '-' : `₩${krw(stats.totalAmount)}`,
      sub: filterMode === 'year' && stats.prevYearAmount ? `전년도 ₩${krw(stats.prevYearAmount)}` : `총 ${stats.totalSalesCount}건`,
      badge: filterMode === 'year' && stats.prevYearAmount ? <Delta curr={stats.totalAmount} prev={stats.prevYearAmount} /> : null,
      border: 'border-l-green-500',
      icon: BarChart2,
      iconBg: 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400',
    },
    {
      label: '매출 건수',
      value: loading ? '-' : `${stats.thisMonthSalesCount}건`,
      sub: `기간 내 총 ${stats.totalSalesCount}건`,
      badge: null,
      border: 'border-l-purple-500',
      icon: Repeat2,
      iconBg: 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
    },
    {
      label: '이달 판매수량',
      value: loading ? '-' : `${fmt(stats.thisMonthQty)}개`,
      sub: `전월 ${fmt(stats.lastMonthQty)}개`,
      badge: <Delta curr={stats.thisMonthQty} prev={stats.lastMonthQty} />,
      border: 'border-l-orange-500',
      icon: Package,
      iconBg: 'bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400',
    },
    {
      label: '이달 납부세액',
      value: loading ? '-' : `₩${krw(thisMonthTax)}`,
      sub: '관세 + 부가세 합계',
      badge: null,
      border: 'border-l-red-500',
      icon: TruckIcon,
      iconBg: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              안녕하세요, {userName ? <span className="text-primary">{userName}님</span> : '...'}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
          </div>
          {/* 기간 필터 */}
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            <button onClick={() => setFilterMode('year')}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                filterMode === 'year' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {curYear}년
            </button>
            <button onClick={() => setFilterMode('all')}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                filterMode === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              전체
            </button>
          </div>
        </div>

        {/* ── KPI 카드 ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpiCards.map(c => (
            <div key={c.label} className={cn('bg-card border border-border border-l-4 rounded-2xl p-4 shadow-sm', c.border)}>
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                <div className={cn('p-1.5 rounded-lg shrink-0', c.iconBg)}>
                  <c.icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight">{c.value}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <p className="text-xs text-muted-foreground">{c.sub}</p>
                {c.badge}
              </div>
            </div>
          ))}
        </div>

        {/* ── 운영 현황 ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {opItems.map(s => (
            <Link key={s.label} href={s.href}>
              <div className={cn('rounded-xl p-3 text-center cursor-pointer hover:opacity-80 transition-opacity', s.bg)}>
                <s.icon className={cn('w-4 h-4 mx-auto mb-1', s.text)} />
                <p className={cn('text-xl font-bold', s.text)}>{loading ? '-' : s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* ── 매출 트렌드 + 최근 매출 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <SectionTitle icon={BarChart2} label="월별 매출 추이 (최근 6개월)" color="text-primary" />
              {filterMode === 'year' && stats.prevYearAmount > 0 && (
                <Delta curr={stats.totalAmount} prev={stats.prevYearAmount} />
              )}
            </div>
            {!loading && <TrendBar data={stats.trend} />}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
              {stats.trend.slice(-3).map(d => (
                <div key={d.month} className="text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{d.month}월</p>
                  <p className="text-sm font-bold">₩{krw(d.amount)}</p>
                  <p className="text-[10px] text-muted-foreground">{fmt(d.qty)}개</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle icon={Clock} label="최근 매출" color="text-orange-500" />
              <Link href="/crm" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">전체 <ArrowRight className="w-3 h-3" /></Link>
            </div>
            <div className="space-y-0">
              {recentSales.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">{s.customer}</p>
                    <p className="text-[10px] text-muted-foreground">{s.saleDate}</p>
                  </div>
                  <p className="text-sm font-semibold shrink-0 ml-2 tabular-nums">₩{krw(s.totalAmount)}</p>
                </div>
              ))}
              {!loading && recentSales.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">매출 데이터가 없습니다.</p>}
            </div>
          </div>
        </div>

        {/* ── 거래처 분석 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RankCard
            title="매출 TOP 5 거래처"
            icon={Users} iconColor="text-blue-600"
            items={stats.topCustomersByAmount}
            valueLabel={v => `₩${krw(v)}`}
            barColor="bg-gradient-to-r from-blue-500 to-blue-400"
          />
          <RankCard
            title="거래 빈도 TOP 5 거래처"
            icon={Repeat2} iconColor="text-indigo-600"
            items={stats.topCustomersByTx}
            valueLabel={v => `${v}건`}
            barColor="bg-gradient-to-r from-indigo-500 to-indigo-400"
          />
        </div>

        {/* ── 제품 분석 + 발주 공급사 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RankCard
            title="매출금액 TOP 5 제품"
            icon={ShoppingCart} iconColor="text-green-600"
            items={stats.topProductsByAmount}
            valueLabel={v => `₩${krw(v)}`}
            barColor="bg-gradient-to-r from-green-500 to-emerald-400"
          />
          <RankCard
            title={`판매수량 TOP 5 제품 (${curYear}년)`}
            icon={Target} iconColor="text-purple-600"
            items={stats.topProductsByQty}
            valueLabel={v => `${fmt(v)}개`}
            barColor="bg-gradient-to-r from-purple-500 to-violet-400"
          />
        </div>

        {/* ── 매출 유형 분포 ── */}
        {stats.saleTypeDistribution.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4">
            <SectionTitle icon={PieChart} label="매출 유형 분포" color="text-pink-600" />
            <div className="space-y-2.5">
              {stats.saleTypeDistribution.map(([type, amt]) => {
                const pct = stats.totalAmount ? Math.round((amt / stats.totalAmount) * 100) : 0;
                const barColor = TYPE_COLORS[type] ?? 'bg-gray-400';
                const textColor = TYPE_TEXT_COLORS[type] ?? 'text-gray-600';
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full bg-muted', textColor)}>{type}</span>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">₩{krw(amt)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 최근 등록 제품 ── */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle icon={Package} label="최근 등록 제품" color="text-primary" />
            <Link href="/products" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">전체 <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {recentProducts.map(p => (
              <div key={p.id} className="border border-border rounded-xl p-3 hover:bg-muted/30 transition-colors">
                <p className="text-[10px] font-mono text-muted-foreground">{p.code || 'N/A'}</p>
                <p className="text-sm font-medium mt-0.5 truncate leading-snug" title={p.nameKo}>{p.nameKo}</p>
                {p.supplierName && <p className="text-[10px] text-muted-foreground mt-1 truncate">{p.supplierName}</p>}
                {p.purchasePrice && <p className="text-xs font-semibold text-blue-600 mt-1">${p.purchasePrice.toLocaleString()}</p>}
              </div>
            ))}
            {!loading && recentProducts.length === 0 && <p className="text-xs text-muted-foreground col-span-5 text-center py-4">등록된 제품이 없습니다.</p>}
          </div>
        </div>

      </div>
    </div>
  );
}
