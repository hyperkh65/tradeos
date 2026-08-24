'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListOrdered, Loader2, ChevronDown, ChevronRight, Settings2, TrendingUp, TrendingDown, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface OrderTrackingItem {
  itemId: string; productName: string; qty: number; unitPrice: number; amount: number;
  soldQty: number; remainingQty: number;
  adjustment: { cutoverDate: string; remainingQty: number; note: string | null; updatedAt: string } | null;
}
interface OrderTrackingPO {
  poId: string; poBusinessId: string; supplierId: string; supplierName: string;
  customerId: string; customerName: string; orderDate: string; currency: string; status: string;
  items: OrderTrackingItem[];
  totalOrderedQty: number; totalRemainingQty: number; totalConsumedQty: number; progressPct: number | null;
}

const statusLabel: Record<string, string> = { draft: '초안', confirmed: '확정', production: '생산', inspection: '검품', shipped: '선적', completed: '완료', cancelled: '취소' };
const statusColor: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', confirmed: 'bg-blue-100 text-blue-700', production: 'bg-yellow-100 text-yellow-700', inspection: 'bg-purple-100 text-purple-700', shipped: 'bg-cyan-100 text-cyan-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-600' };

type PeriodType = 'all' | 'month' | 'quarter' | 'range';

function quarterRange(year: number, q: number): [string, string] {
  const startMonth = (q - 1) * 3 + 1;
  const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return [start, end];
}

export default function OrderTrackingPage() {
  const [orders, setOrders] = useState<OrderTrackingPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adjustOpen, setAdjustOpen] = useState(false);

  const [periodType, setPeriodType] = useState<PeriodType>('all');
  const [monthValue, setMonthValue] = useState(new Date().toISOString().slice(0, 7));
  const now = new Date();
  const [quarterYear, setQuarterYear] = useState(now.getFullYear());
  const [quarterQ, setQuarterQ] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('전체');
  const [customerFilter, setCustomerFilter] = useState('전체');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [productSearch, setProductSearch] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/scm/orders').then(r => r.json()).then(j => setOrders(Array.isArray(j.data) ? j.data : [])).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    fetch('/api/auth/me').then(r => r.json()).then(j => { if (j.user) setCurrentUser(j.user); });
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  const matchesPeriod = (dateStr: string): boolean => {
    if (!dateStr) return periodType === 'all';
    if (periodType === 'all') return true;
    if (periodType === 'month') return dateStr.slice(0, 7) === monthValue;
    if (periodType === 'quarter') {
      const [start, end] = quarterRange(quarterYear, quarterQ);
      return dateStr >= start && dateStr <= end;
    }
    if (periodType === 'range') {
      if (!rangeStart && !rangeEnd) return true;
      if (rangeStart && dateStr < rangeStart) return false;
      if (rangeEnd && dateStr > rangeEnd) return false;
      return true;
    }
    return true;
  };

  const supplierOptions = useMemo(() => ['전체', ...Array.from(new Set(orders.map(o => o.supplierName).filter(Boolean)))], [orders]);
  const customerOptions = useMemo(() => ['전체', ...Array.from(new Set(orders.map(o => o.customerName).filter(Boolean)))], [orders]);

  const filtered = useMemo(() => orders.filter(o => {
    if (!matchesPeriod(o.orderDate)) return false;
    if (supplierFilter !== '전체' && o.supplierName !== supplierFilter) return false;
    if (customerFilter !== '전체' && o.customerName !== customerFilter) return false;
    if (statusFilter !== '전체' && o.status !== statusFilter) return false;
    if (productSearch && !o.items.some(i => i.productName.toLowerCase().includes(productSearch.toLowerCase()))) return false;
    return true;
  }), [orders, periodType, monthValue, quarterYear, quarterQ, rangeStart, rangeEnd, supplierFilter, customerFilter, statusFilter, productSearch]);

  const summary = useMemo(() => {
    const totalOrdered = filtered.reduce((s, o) => s + o.totalOrderedQty, 0);
    const totalRemaining = filtered.reduce((s, o) => s + o.totalRemainingQty, 0);
    const totalConsumed = filtered.reduce((s, o) => s + o.totalConsumedQty, 0);
    const withProgress = filtered.filter(o => o.progressPct != null);
    const avgProgress = withProgress.length ? withProgress.reduce((s, o) => s + (o.progressPct || 0), 0) / withProgress.length : null;
    return { totalOrdered, totalRemaining, totalConsumed, avgProgress };
  }, [filtered]);

  // 단가 변동: 제품별로 발주일 순 정렬, 직전 단가와 다르면 하이라이트
  const priceHistory = useMemo(() => {
    const byProduct = new Map<string, Array<{ date: string; price: number; poBusinessId: string; supplierName: string }>>();
    for (const o of filtered) {
      for (const it of o.items) {
        if (!it.productName || !it.unitPrice) continue;
        const arr = byProduct.get(it.productName) || [];
        arr.push({ date: o.orderDate, price: it.unitPrice, poBusinessId: o.poBusinessId, supplierName: o.supplierName });
        byProduct.set(it.productName, arr);
      }
    }
    const result: Array<{ product: string; entries: Array<{ date: string; price: number; poBusinessId: string; supplierName: string; changed: boolean; up: boolean }> }> = [];
    for (const [product, entries] of byProduct.entries()) {
      const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
      let hasChange = false;
      const withFlags = sorted.map((e, idx) => {
        const prev = idx > 0 ? sorted[idx - 1] : null;
        const changed = !!prev && prev.price !== e.price;
        if (changed) hasChange = true;
        return { ...e, changed, up: changed && prev ? e.price > prev.price : false };
      });
      if (hasChange && withFlags.length > 1) result.push({ product, entries: withFlags });
    }
    return result.sort((a, b) => a.product.localeCompare(b.product));
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="오더 추적" icon={<ListOrdered className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
        {/* Filters */}
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {(['all', 'month', 'quarter', 'range'] as PeriodType[]).map(pt => (
                <button key={pt} onClick={() => setPeriodType(pt)}
                  className={cn('text-xs px-2.5 py-1.5 rounded-md transition-colors', periodType === pt ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground')}>
                  {pt === 'all' ? '전체' : pt === 'month' ? '월별' : pt === 'quarter' ? '분기별' : '기간지정'}
                </button>
              ))}
            </div>
            {periodType === 'month' && (
              <input type="month" value={monthValue} onChange={e => setMonthValue(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
            )}
            {periodType === 'quarter' && (
              <div className="flex items-center gap-1">
                <input type="number" value={quarterYear} onChange={e => setQuarterYear(Number(e.target.value))} className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs" />
                <select value={quarterQ} onChange={e => setQuarterQ(Number(e.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                  <option value={1}>1분기</option><option value={2}>2분기</option><option value={3}>3분기</option><option value={4}>4분기</option>
                </select>
              </div>
            )}
            {periodType === 'range' && (
              <div className="flex items-center gap-1">
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
                <span className="text-xs text-muted-foreground">~</span>
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
              </div>
            )}
            <div className="flex-1" />
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)} className="gap-1.5">
                <Settings2 className="w-3.5 h-3.5" /> 기준시점 조정
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              {supplierOptions.map(s => <option key={s} value={s}>{s === '전체' ? '공급업체 전체' : s}</option>)}
            </select>
            <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              {customerOptions.map(c => <option key={c} value={c}>{c === '전체' ? '고객사 전체' : c}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="전체">상태 전체</option>
              {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="제품명 검색..." className="h-8 text-xs w-40" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-card border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">발주 건수</p>
                <p className="text-2xl font-bold mt-1">{filtered.length}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
              </div>
              <div className="bg-card border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">총 발주수량</p>
                <p className="text-2xl font-bold mt-1">{summary.totalOrdered.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">개</span></p>
              </div>
              <div className="bg-card border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">잔여 발주수량</p>
                <p className="text-2xl font-bold mt-1 text-orange-600">{summary.totalRemaining.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">개</span></p>
              </div>
              <div className="bg-card border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">평균 진척률</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{summary.avgProgress != null ? `${summary.avgProgress.toFixed(1)}%` : '-'}</p>
              </div>
            </div>

            {/* Order list */}
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="p-4 border-b"><p className="text-sm font-medium">오더별 추적</p></div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="w-8" />
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">발주번호</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">발주일</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">공급업체</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">고객사</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">발주수량</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">잔여수량</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">진척률</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">조건에 맞는 발주가 없습니다.</td></tr>
                    ) : filtered.map(o => (
                      <Fragment key={o.poId}>
                        <tr className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded(e => ({ ...e, [o.poId]: !e[o.poId] }))}>
                          <td className="pl-3">{expanded[o.poId] ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}</td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{o.poBusinessId}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{o.orderDate}</td>
                          <td className="px-3 py-2"><span className="truncate block max-w-[140px]">{o.supplierName}</span></td>
                          <td className="px-3 py-2"><span className="truncate block max-w-[140px]">{o.customerName || '-'}</span></td>
                          <td className="px-3 py-2 text-right">{o.totalOrderedQty.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-medium text-orange-600">{o.totalRemainingQty.toLocaleString()}</td>
                          <td className="px-3 py-2">
                            {o.progressPct != null ? (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-green-500" style={{ width: `${Math.min(100, o.progressPct)}%` }} />
                                </div>
                                <span className="text-muted-foreground whitespace-nowrap">{o.progressPct.toFixed(0)}%</span>
                              </div>
                            ) : <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="px-3 py-2"><span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', statusColor[o.status])}>{statusLabel[o.status] || o.status}</span></td>
                        </tr>
                        {expanded[o.poId] && (
                          <tr>
                            <td colSpan={9} className="bg-muted/20 px-6 py-3">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th className="text-left py-1 font-medium">품목</th>
                                    <th className="text-right py-1 font-medium">발주수량</th>
                                    <th className="text-right py-1 font-medium">단가</th>
                                    <th className="text-right py-1 font-medium">판매(소진)수량</th>
                                    <th className="text-right py-1 font-medium">잔여수량</th>
                                    <th className="text-left py-1 font-medium">기준시점 조정</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                  {o.items.map(it => (
                                    <tr key={it.itemId}>
                                      <td className="py-1.5">{it.productName}</td>
                                      <td className="py-1.5 text-right">{it.qty.toLocaleString()}</td>
                                      <td className="py-1.5 text-right">{it.unitPrice.toLocaleString()}</td>
                                      <td className="py-1.5 text-right">{it.soldQty.toLocaleString()}</td>
                                      <td className="py-1.5 text-right font-medium text-orange-600">{it.remainingQty.toLocaleString()}</td>
                                      <td className="py-1.5 text-muted-foreground">
                                        {it.adjustment ? `${it.adjustment.cutoverDate} 기준 ${it.adjustment.remainingQty.toLocaleString()}개` : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Price change highlight */}
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="p-4 border-b">
                <p className="text-sm font-medium">단가 변동 하이라이트</p>
                <p className="text-xs text-muted-foreground mt-0.5">같은 제품의 발주 단가가 바뀐 이력만 표시됩니다.</p>
              </div>
              {priceHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">선택한 조건에서 단가 변동이 없습니다.</p>
              ) : (
                <div className="divide-y">
                  {priceHistory.map(ph => (
                    <div key={ph.product} className="p-4">
                      <p className="text-xs font-semibold mb-2">{ph.product}</p>
                      <div className="flex flex-wrap gap-2">
                        {ph.entries.map((e, idx) => (
                          <div key={idx} className={cn('flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border',
                            e.changed ? (e.up ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700') : 'bg-muted/30 border-transparent text-muted-foreground')}>
                            {e.changed && (e.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                            <span>{e.date}</span>
                            <span className="font-semibold">{e.price.toLocaleString()}</span>
                            <span className="text-muted-foreground">{e.supplierName} · {e.poBusinessId}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {adjustOpen && <AdjustModal orders={orders} onClose={() => setAdjustOpen(false)} onSaved={() => { setAdjustOpen(false); load(); }} />}
    </div>
  );
}

function AdjustModal({ orders, onClose, onSaved }: { orders: OrderTrackingPO[]; onClose: () => void; onSaved: () => void }) {
  const [cutoverDate, setCutoverDate] = useState(new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [remaining, setRemaining] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const candidates = orders.filter(o => o.status !== 'cancelled');

  const toggle = (poId: string) => {
    setSelected(s => ({ ...s, [poId]: !s[poId] }));
  };

  const keyOf = (poId: string, itemId: string) => `${poId}::${itemId}`;

  const remainingFor = (o: OrderTrackingPO, it: OrderTrackingItem) => {
    const k = keyOf(o.poId, it.itemId);
    return remaining[k] != null ? remaining[k] : it.remainingQty;
  };

  const save = async () => {
    const selectedIds = Object.keys(selected).filter(id => selected[id]);
    if (selectedIds.length === 0 || !cutoverDate) return;
    setSaving(true);
    try {
      const tasks: Promise<any>[] = [];
      for (const poId of selectedIds) {
        const o = candidates.find(c => c.poId === poId);
        if (!o) continue;
        for (const it of o.items) {
          const k = keyOf(o.poId, it.itemId);
          tasks.push(fetch('/api/scm/po-adjustments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              poId: o.poId, poBusinessId: o.poBusinessId, itemId: it.itemId, productName: it.productName,
              cutoverDate, remainingQty: remainingFor(o, it), note: notes[k] || undefined,
            }),
          }));
        }
      }
      await Promise.all(tasks);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="font-semibold text-sm">잔여수량 기준시점 조정</h2>
            <p className="text-xs text-muted-foreground mt-0.5">활성 오더를 선택하고, 기준 시점의 잔여수량을 입력하세요. 이후 판매분은 자동으로 차감됩니다. 언제든 다시 조정할 수 있습니다.</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-4 border-b shrink-0 flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">기준 시점</label>
          <input type="date" value={cutoverDate} onChange={e => setCutoverDate(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {candidates.map(o => (
            <div key={o.poId} className="border rounded-lg overflow-hidden">
              <label className="flex items-center gap-2 p-2.5 bg-muted/30 cursor-pointer">
                <input type="checkbox" checked={!!selected[o.poId]} onChange={() => toggle(o.poId)} className="w-4 h-4 accent-primary" />
                <span className="text-xs font-mono">{o.poBusinessId}</span>
                <span className="text-xs text-muted-foreground">{o.supplierName}{o.customerName ? ` → ${o.customerName}` : ''}</span>
                <span className="text-xs text-muted-foreground ml-auto">현재 잔여 {o.totalRemainingQty.toLocaleString()}개</span>
              </label>
              {selected[o.poId] && (
                <div className="p-2.5 space-y-1.5">
                  {o.items.map(it => {
                    const k = keyOf(o.poId, it.itemId);
                    return (
                      <div key={it.itemId} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate">{it.productName}</span>
                        <span className="text-muted-foreground">발주 {it.qty.toLocaleString()}</span>
                        <input type="number" defaultValue={it.remainingQty}
                          onChange={e => setRemaining(r => ({ ...r, [k]: Number(e.target.value) }))}
                          className="w-24 h-7 rounded-md border border-input bg-background px-2 text-xs text-right" />
                        <input placeholder="비고" defaultValue={notes[k] || ''}
                          onChange={e => setNotes(n => ({ ...n, [k]: e.target.value }))}
                          className="w-32 h-7 rounded-md border border-input bg-background px-2 text-xs" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving || Object.values(selected).every(v => !v)}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
