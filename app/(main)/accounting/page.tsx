'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Receipt, Plus, Search, X, Pencil, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface Expense {
  id: string; businessId: string; category: string; description: string;
  amount: number; currency: string; amountKrw?: number; exchangeRate?: number;
  relatedName?: string; status: string; createdAt: string;
}

const statusStyle: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700' };
const statusLabel: Record<string, string> = { pending: '대기', approved: '승인', paid: '지급완료' };
const CATEGORIES = ['해상운임', '통관비', '검품비', '샘플비', '보험료', '창고비', '청구서', '기타'];
const catColor: Record<string, string> = { '해상운임': 'bg-blue-50 text-blue-700', '통관비': 'bg-orange-50 text-orange-700', '검품비': 'bg-purple-50 text-purple-700', '샘플비': 'bg-green-50 text-green-700', '청구서': 'bg-indigo-50 text-indigo-700' };

function ExpenseModal({ item, onClose, onSave }: { item?: Expense | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    category: item?.category || '해상운임',
    description: item?.description || '',
    amount: item?.amount?.toString() || '',
    currency: item?.currency || 'KRW',
    exchangeRate: item?.exchangeRate?.toString() || '1380',
    relatedName: item?.relatedName || '',
    status: (item?.status || 'pending') as string,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    setSaving(true);
    try {
      const body = { ...form, amount: Number(form.amount), exchangeRate: form.currency !== 'KRW' ? Number(form.exchangeRate) : undefined };
      if (item) {
        await fetch(`/api/expenses/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">{item ? '회계 수정' : '회계/청구 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">카테고리</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="pending">대기</option>
                <option value="approved">승인</option>
                <option value="paid">지급완료</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">설명 *</label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="PO-2026-0031 LCL 운임" required />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">금액 *</label>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="850" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>KRW</option><option>USD</option><option>EUR</option><option>CNY</option>
              </select>
            </div>
          </div>
          {form.currency !== 'KRW' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">환율</label>
              <Input type="number" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} placeholder="1380" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">관련 건</label>
            <Input value={form.relatedName} onChange={e => setForm(f => ({ ...f, relatedName: e.target.value }))} placeholder="SHP-2026-0035" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정' : '등록')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ImportTax {
  id: string; businessId: string; declarationDate?: string; createdAt: string;
  duty?: number; vat?: number; brokerFee?: number; inspectionFee?: number;
  warehouseFee?: number; inlandFreight?: number; refundAmount?: number;
}

export default function AccountingPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [imports, setImports] = useState<ImportTax[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('전체');
  const [modal, setModal] = useState<{ open: boolean; item?: Expense | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const [expRes, impRes] = await Promise.all([
      fetch('/api/expenses').then(r => r.json()),
      fetch('/api/imports').then(r => r.json()),
    ]);
    setExpenses(Array.isArray(expRes.data) ? expRes.data : []);
    setImports(Array.isArray(impRes.data) ? impRes.data : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = expenses.filter(e => {
    const ms = e.description.includes(search) || e.businessId.includes(search) || (e.relatedName ?? '').includes(search);
    const mc = catFilter === '전체' || e.category === catFilter;
    return ms && mc;
  });

  const totalKrw = filtered.reduce((s, e) => s + Number(e.amountKrw ?? e.amount), 0);
  const pendingCount = filtered.filter(e => e.status === 'pending').length;
  const paidCount = filtered.filter(e => e.status === 'paid').length;

  // Category breakdown
  const byCat: Record<string, number> = {};
  filtered.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amountKrw ?? e.amount); });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = catEntries[0]?.[1] || 1;

  const cats = ['전체', ...CATEGORIES.filter(c => expenses.some(e => e.category === c))];

  // 수입세금 월별 집계 (최근 6개월)
  const monthlyTax = (() => {
    const now = new Date();
    const months: { label: string; duty: number; vat: number; other: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const label = `${d.getMonth() + 1}월`;
      const monthImports = imports.filter(imp =>
        (imp.declarationDate || imp.createdAt || '').startsWith(key)
      );
      months.push({
        label,
        duty: monthImports.reduce((s, i) => s + (i.duty || 0), 0),
        vat: monthImports.reduce((s, i) => s + (i.vat || 0), 0),
        other: monthImports.reduce((s, i) => s + (i.brokerFee || 0) + (i.inspectionFee || 0) + (i.warehouseFee || 0) + (i.inlandFreight || 0), 0),
      });
    }
    return months;
  })();
  const maxMonthTax = Math.max(...monthlyTax.map(m => m.duty + m.vat + m.other), 1);
  const yearTotalDuty = imports.filter(i => (i.declarationDate || i.createdAt || '').startsWith(String(new Date().getFullYear()))).reduce((s, i) => s + (i.duty || 0) + (i.vat || 0), 0);
  const yearTotalRefund = imports.reduce((s, i) => s + (i.refundAmount || 0), 0);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="회계 / 청구" icon={<Receipt className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">합계 금액</p>
            <p className="text-xl font-bold mt-1">₩{totalKrw.toLocaleString()}</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">대기</p>
            <p className="text-xl font-bold text-yellow-600 mt-1">{pendingCount}건</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">지급완료</p>
            <p className="text-xl font-bold text-green-600 mt-1">{paidCount}건</p>
          </div>
        </div>

        {/* 수입세금 월별 차트 */}
        {imports.length > 0 && (
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">수입세금 월별 현황 (최근 6개월)</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-orange-400 rounded-sm inline-block" />관세</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-400 rounded-sm inline-block" />부가세</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-gray-300 rounded-sm inline-block" />기타</span>
              </div>
            </div>
            <div className="flex items-end gap-2 h-28">
              {monthlyTax.map(m => {
                const total = m.duty + m.vat + m.other;
                const dutyH = total > 0 ? Math.round((m.duty / maxMonthTax) * 100) : 0;
                const vatH = total > 0 ? Math.round((m.vat / maxMonthTax) * 100) : 0;
                const otherH = total > 0 ? Math.round((m.other / maxMonthTax) * 100) : 0;
                return (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end h-20 gap-px">
                      {otherH > 0 && <div className="w-full bg-gray-300 rounded-t-sm" style={{ height: `${otherH}%` }} />}
                      {vatH > 0 && <div className="w-full bg-blue-400" style={{ height: `${vatH}%` }} />}
                      {dutyH > 0 && <div className="w-full bg-orange-400 rounded-b-sm" style={{ height: `${dutyH}%` }} />}
                      {total === 0 && <div className="w-full h-px bg-muted" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                    {total > 0 && <span className="text-[9px] font-medium text-foreground">{total >= 1000000 ? `${(total/1000000).toFixed(0)}만` : total.toLocaleString()}</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t flex items-center gap-6 text-xs text-muted-foreground">
              <span>올해 납부세액: <strong className="text-orange-600">₩{yearTotalDuty.toLocaleString()}</strong></span>
              {yearTotalRefund > 0 && <span>환급 합계: <strong className="text-green-600">₩{yearTotalRefund.toLocaleString()}</strong></span>}
            </div>
          </div>
        )}

        {/* Category bar chart */}
        {catEntries.length > 0 && (
          <div className="bg-card border rounded-xl p-4">
            <p className="text-sm font-medium mb-3">카테고리별 금액</p>
            <div className="space-y-2">
              {catEntries.slice(0, 6).map(([cat, amt]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20 shrink-0 truncate">{cat}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${(amt / maxCat) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium w-24 text-right shrink-0">₩{amt.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters & table */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="설명, 번호 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {cats.map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                  catFilter === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
                {c}
              </button>
            ))}
          </div>
          <Button onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4 mr-1" /> 등록
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">번호</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">카테고리</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">설명</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">금액</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">원화</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">관련</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">상태</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">데이터가 없습니다.</td></tr>
                ) : filtered.map(e => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.businessId}</td>
                    <td className="px-4 py-3"><span className={cn('text-xs px-2 py-0.5 rounded-full', catColor[e.category] ?? 'bg-gray-100 text-gray-600')}>{e.category}</span></td>
                    <td className="px-4 py-3 text-sm max-w-[200px] truncate">{e.description}</td>
                    <td className="px-4 py-3 text-right text-xs font-mono">{e.currency} {Number(e.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold">₩{Number(e.amountKrw ?? e.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">{e.relatedName ?? '-'}</td>
                    <td className="px-4 py-3"><span className={cn('text-xs px-2 py-0.5 rounded-full', statusStyle[e.status])}>{statusLabel[e.status]}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: e })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(e.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modal.open && (
        <ExpenseModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
