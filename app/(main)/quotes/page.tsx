'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList, Plus, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Quote } from '@/types';

const statusStyle: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', expired: 'bg-orange-100 text-orange-700' };
const statusLabel: Record<string, string> = { draft: '초안', sent: '발송', accepted: '수락', rejected: '거절', expired: '만료' };
const typeLabel: Record<string, string> = { customer: '판매견적', supplier: '구매견적' };
const typeStyle: Record<string, string> = { customer: 'bg-emerald-50 text-emerald-700', supplier: 'bg-violet-50 text-violet-700' };

function QuoteModal({ onClose, onSave }: { onClose: () => void; onSave: (q: Quote) => void }) {
  const [form, setForm] = useState({ type: 'customer', companyName: '', currency: 'KRW', validity: '', paymentTerms: '', incoterm: '', productName: '', qty: '', unitPrice: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName || !form.productName) return;
    setSaving(true);
    const items = [{ productName: form.productName, quantity: Number(form.qty), unitPrice: Number(form.unitPrice), moq: 0 }];
    try {
      const res = await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, items, status: 'draft' }) });
      const json = await res.json();
      if (json.data) onSave(json.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">새 견적</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">유형</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="customer">판매견적</option>
                <option value="supplier">구매견적</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>KRW</option><option>USD</option><option>EUR</option><option>CNY</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">거래처명 *</label>
            <Input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="(주)한국에너지솔루션" required />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">제품명 *</label>
            <Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="LED 패널 40W" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">수량</label>
              <Input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="500" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">단가</label>
              <Input type="number" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} placeholder="32000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">유효기한</label>
              <Input type="date" value={form.validity} onChange={e => setForm(f => ({ ...f, validity: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">인코텀</label>
              <Input value={form.incoterm} onChange={e => setForm(f => ({ ...f, incoterm: e.target.value }))} placeholder="FOB Ningbo" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/quotes').then(r => r.json()).then(j => { if (j.data) setQuotes(j.data); }).finally(() => setLoading(false));
  }, []);

  const filtered = quotes.filter(q =>
    q.businessId.includes(search) || q.companyName.includes(search) ||
    q.items.some(i => i.productName.includes(search))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="견적" />
      {showModal && <QuoteModal onClose={() => setShowModal(false)} onSave={q => { setQuotes(prev => [q, ...prev]); setShowModal(false); }} />}
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="견적번호, 거래처명 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">새 견적</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{['견적번호', '유형', '거래처', '제품', '통화', '유효기한', '상태'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(q => (
                    <tr key={q.id} className="hover:bg-muted/30 cursor-pointer">
                      <td className="px-4 py-3 font-mono text-xs">{q.businessId}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', typeStyle[q.type])}>{typeLabel[q.type]}</span></td>
                      <td className="px-4 py-3 font-medium max-w-[160px] truncate">{q.companyName}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{q.items.map(i => i.productName).join(', ')}</td>
                      <td className="px-4 py-3 text-xs">{q.currency}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{q.validity ?? '-'}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusStyle[q.status])}>{statusLabel[q.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />견적 내역이 없습니다.</div>}
            </div>

            <div className="md:hidden space-y-2">
              {filtered.map(q => (
                <div key={q.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{q.businessId}</p>
                      <p className="font-semibold text-sm mt-0.5">{q.companyName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', typeStyle[q.type])}>{typeLabel[q.type]}</span>
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', statusStyle[q.status])}>{statusLabel[q.status]}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{q.items.map(i => i.productName).join(', ')}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{q.currency}</span>{q.validity && <span>유효: {q.validity}</span>}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">견적 내역이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
