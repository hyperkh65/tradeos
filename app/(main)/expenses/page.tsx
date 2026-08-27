'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, Plus, Search, X, Loader2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Expense } from '@/types';

const statusStyle: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700' };
const statusLabel: Record<string, string> = { pending: '대기', approved: '승인', paid: '지급완료' };
const catColor: Record<string, string> = { '해상운임': 'bg-blue-50 text-blue-700', '통관비': 'bg-orange-50 text-orange-700', '검품비': 'bg-purple-50 text-purple-700', '샘플비': 'bg-green-50 text-green-700' };
const CATEGORIES = ['해상운임', '통관비', '검품비', '샘플비', '보험료', '창고비', '기타'];

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
          <h2 className="font-semibold">{item ? '비용 수정' : '비용 등록'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }} className="p-4 space-y-3">
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
                <option>KRW</option><option>USD</option><option>EUR</option>
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
          {form.amount && form.currency !== 'KRW' && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <span className="text-muted-foreground">원화 환산: </span>
              <span className="font-semibold">₩{(Number(form.amount) * Number(form.exchangeRate || 1380)).toLocaleString()}</span>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정' : '저장')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item?: Expense | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/expenses').then(r => r.json());
    if (res.data) setExpenses(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('비용을 삭제하시겠습니까?')) return;
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = expenses.filter(e =>
    e.businessId.includes(search) || e.description.includes(search) || e.category.includes(search)
  );
  const totalKrw = filtered.reduce((s, e) => s + Number(e.amountKrw ?? e.amount), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="비용" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground">전체 비용</p>
            <p className="text-lg font-bold mt-0.5">₩{totalKrw.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground">대기</p>
            <p className="text-lg font-bold text-yellow-600 mt-0.5">{filtered.filter(e => e.status === 'pending').length}건</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground">지급완료</p>
            <p className="text-lg font-bold text-green-600 mt-0.5">{filtered.filter(e => e.status === 'paid').length}건</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="비용번호, 설명 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">비용 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{['번호', '카테고리', '설명', '금액', '원화금액', '관련', '상태', '관리'].map(h => <th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', ['금액', '원화금액'].includes(h) ? 'text-right' : h === '관리' ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(e => (
                    <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{e.businessId}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs px-2 py-0.5 rounded-full', catColor[e.category] ?? 'bg-gray-100 text-gray-600')}>{e.category}</span></td>
                      <td className="px-4 py-3 text-sm max-w-[200px] truncate">{e.description}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono">{e.currency} {Number(e.amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold text-sm">₩{Number(e.amountKrw ?? e.amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">{e.relatedName ?? '-'}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', statusStyle[e.status])}>{statusLabel[e.status]}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: e })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />비용 내역이 없습니다.</div>}
            </div>

            <div className="md:hidden space-y-2">
              {filtered.map(e => (
                <div key={e.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[11px] px-2 py-0.5 rounded-full shrink-0', catColor[e.category] ?? 'bg-gray-100 text-gray-600')}>{e.category}</span>
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', statusStyle[e.status])}>{statusLabel[e.status]}</span>
                      </div>
                      <p className="text-sm font-medium mt-1 truncate">{e.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-base">₩{Number(e.amountKrw ?? e.amount).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{e.currency} {Number(e.amount).toLocaleString()}</p>
                    </div>
                  </div>
                  {e.relatedName && <p className="text-xs text-muted-foreground mt-1">{e.relatedName}</p>}
                  <div className="flex justify-end gap-1 mt-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: e })}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">비용 내역이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
      {modal.open && (
        <ExpenseModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
