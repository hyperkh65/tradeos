'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GitMerge, Warehouse, ShoppingCart, Search, Loader2, AlertTriangle, Timer } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface InventoryItem {
  id: string; productName: string; productCode: string;
  qty: number; location: string; memo?: string;
}
interface SalesRecord {
  id: string; businessId: string; saleDate: string; customer: string;
  items: Array<{ product: string; qty: number; unitPrice: number; amount: number }>;
  netAmount: number; totalAmount: number;
}
interface LeadTimeStage { key: string; label: string; avgDays: number | null; sampleCount: number }
interface SupplierLeadTime {
  supplierName: string; poCount: number; stages: LeadTimeStage[];
  avgTotalDays: number | null; totalSampleCount: number;
}

export default function SCMPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [leadTime, setLeadTime] = useState<SupplierLeadTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadTimeLoading, setLeadTimeLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/sales').then(r => r.json()),
    ]).then(([inv, sal]) => {
      setInventory(Array.isArray(inv.data) ? inv.data : []);
      setSales(Array.isArray(sal.data) ? sal.data : []);
    }).finally(() => setLoading(false));

    fetch('/api/scm/lead-time').then(r => r.json()).then(j => {
      setLeadTime(j.data?.suppliers || []);
    }).finally(() => setLeadTimeLoading(false));
  }, []);

  const filtered = inventory.filter(i =>
    i.productName.toLowerCase().includes(search.toLowerCase()) ||
    i.productCode.toLowerCase().includes(search.toLowerCase())
  );

  const totalItems = inventory.length;
  const lowStock = inventory.filter(i => i.qty > 0 && i.qty < 10).length;
  const outOfStock = inventory.filter(i => i.qty <= 0).length;
  const totalQty = inventory.reduce((s, i) => s + i.qty, 0);

  // Recent sales (last 5)
  const recentSales = [...sales].sort((a, b) => b.saleDate.localeCompare(a.saleDate)).slice(0, 5);

  // Sales by product (top 5)
  const prodSales: Record<string, number> = {};
  sales.forEach(s => {
    s.items?.forEach(item => {
      if (item.product) prodSales[item.product] = (prodSales[item.product] || 0) + (item.qty || 0);
    });
  });
  const topProducts = Object.entries(prodSales).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="SCM (공급망 관리)" icon={<GitMerge className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        <Link href="/scm/orders" className="flex items-center justify-between bg-card border rounded-xl p-4 hover:border-primary/50 transition-colors group">
          <div>
            <p className="text-sm font-semibold group-hover:text-primary transition-colors">오더 추적 (고객사별 · 공급업체별 발주 현황)</p>
            <p className="text-xs text-muted-foreground mt-0.5">발주수량, 입고대비 잔여수량, 단가 변동, 판매 진척률을 오더 단위로 한눈에 확인</p>
          </div>
          <span className="text-xs text-primary group-hover:underline whitespace-nowrap">바로가기 →</span>
        </Link>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">재고 품목</p>
            <p className="text-2xl font-bold mt-1">{totalItems}<span className="text-sm font-normal text-muted-foreground ml-1">종</span></p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">총 재고수량</p>
            <p className="text-2xl font-bold mt-1">{totalQty.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">개</span></p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">재고 부족</p>
            <p className={`text-2xl font-bold mt-1 ${lowStock > 0 ? 'text-yellow-600' : 'text-muted-foreground'}`}>{lowStock}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">품절</p>
            <p className={`text-2xl font-bold mt-1 ${outOfStock > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{outOfStock}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Top selling products */}
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">판매 상위 품목</p>
              <Link href="/crm" className="text-xs text-primary hover:underline">매출 보기 →</Link>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">판매 데이터 없음</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map(([prod, qty], idx) => (
                  <div key={prod} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <span className="text-sm flex-1 truncate">{prod}</span>
                    <span className="text-sm font-medium text-muted-foreground">{qty.toLocaleString()}개</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent sales */}
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">최근 매출</p>
              <Link href="/crm" className="text-xs text-primary hover:underline">전체 보기 →</Link>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : recentSales.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">매출 데이터 없음</p>
            ) : (
              <div className="space-y-2">
                {recentSales.map(s => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{s.saleDate}</span>
                    <span className="text-sm flex-1 truncate">{s.customer}</span>
                    <span className="text-sm font-medium">₩{s.netAmount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lead time analysis */}
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Timer className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">공급업체별 리드타임 (발주 → 생산 → 검품 → 선적 → 통관)</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">발주서/선적/통관에 입력된 날짜를 기준으로 자동 계산됩니다. 날짜가 비어있는 구간은 평균에서 제외됩니다.</p>
          {leadTimeLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : leadTime.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">계산할 발주 데이터가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">공급업체</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">발주건수</th>
                    {leadTime[0]?.stages.map(s => (
                      <th key={s.key} className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{s.label}</th>
                    ))}
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">전체 평균</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leadTime.map(sup => (
                    <tr key={sup.supplierName} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium truncate max-w-[160px]">{sup.supplierName}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{sup.poCount}</td>
                      {sup.stages.map(s => (
                        <td key={s.key} className="px-3 py-2 text-right">
                          {s.avgDays != null ? <span>{s.avgDays}일 <span className="text-muted-foreground">({s.sampleCount})</span></span> : <span className="text-muted-foreground">-</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold">
                        {sup.avgTotalDays != null ? <span>{sup.avgTotalDays}일 <span className="text-muted-foreground font-normal">({sup.totalSampleCount})</span></span> : <span className="text-muted-foreground font-normal">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Inventory list */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-medium">재고 현황</h2>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-8 text-sm" placeholder="제품명, 품번..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Link href="/inventory">
              <Button variant="outline" size="sm">
                <Warehouse className="w-4 h-4 mr-1" /> 재고 관리
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">제품명</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">품번</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">수량</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">위치</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">재고 데이터 없음</td></tr>
                  ) : filtered.map(item => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{item.productName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.productCode || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${item.qty <= 0 ? 'text-red-500' : item.qty < 10 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {item.qty.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.location}</td>
                      <td className="px-4 py-3">
                        {item.qty <= 0 ? (
                          <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="w-3 h-3" /> 품절</span>
                        ) : item.qty < 10 ? (
                          <span className="flex items-center gap-1 text-xs text-yellow-600"><AlertTriangle className="w-3 h-3" /> 부족</span>
                        ) : (
                          <span className="text-xs text-green-600">정상</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
