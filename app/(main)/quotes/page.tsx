'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList, Plus, Search, X, Loader2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Quote } from '@/types';

const statusStyle: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', expired: 'bg-orange-100 text-orange-700' };
const statusLabel: Record<string, string> = { draft: '초안', sent: '발송', accepted: '수락', rejected: '거절', expired: '만료' };
const typeLabel: Record<string, string> = { customer: '판매견적', supplier: '구매견적' };
const typeStyle: Record<string, string> = { customer: 'bg-emerald-50 text-emerald-700', supplier: 'bg-violet-50 text-violet-700' };

const emptyItem = () => ({ id: Date.now().toString(), productName: '', specification: '', voltage: '', watts: '', cct: '', quantity: 1, moq: 0, unitPrice: 0, amount: 0 });

function QuoteModal({ item, onClose, onSave }: { item?: Quote | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    type: item?.type || 'customer',
    companyName: item?.companyName || '',
    currency: item?.currency || 'KRW',
    validity: item?.validity || '',
    paymentTerms: item?.paymentTerms || '',
    incoterm: item?.incoterm || '',
    status: item?.status || 'draft',
    items: item?.items?.length ? item.items.map((i, idx) => ({ ...i, id: String(idx), specification: (i as any).specification || '', voltage: (i as any).voltage || '', watts: (i as any).watts || '', cct: (i as any).cct || '' })) : [emptyItem()],
  });
  const [saving, setSaving] = useState(false);

  const updateItem = (idx: number, field: string, val: string | number) => {
    const items = [...form.items];
    (items[idx] as any)[field] = val;
    if (field === 'quantity' || field === 'unitPrice') {
      (items[idx] as any).amount = items[idx].quantity * items[idx].unitPrice;
    }
    setForm(f => ({ ...f, items }));
  };

  const totalAmount = form.items.reduce((s, i) => s + ((i as any).amount || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName) return;
    setSaving(true);
    try {
      const body = { ...form, totalAmount };
      if (item) {
        await fetch(`/api/quotes/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, status: 'draft' }) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">{item ? '견적 수정' : '새 견적'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">유형</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="customer">판매견적</option>
                <option value="supplier">구매견적</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">거래처 *</label>
              <Input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="(주)한국에너지" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>KRW</option><option>USD</option><option>EUR</option><option>CNY</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">유효기한</label>
              <Input type="date" value={form.validity} onChange={e => setForm(f => ({ ...f, validity: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">결제조건</label>
              <Input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="30 days net" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">인코텀</label>
              <Input value={form.incoterm} onChange={e => setForm(f => ({ ...f, incoterm: e.target.value }))} placeholder="FOB Ningbo" />
            </div>
          </div>

          {/* Line items */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">품목</th>
                  <th className="px-3 py-2 text-left font-medium">규격</th>
                  <th className="px-3 py-2 text-left font-medium w-16">전압</th>
                  <th className="px-3 py-2 text-left font-medium w-14">와트</th>
                  <th className="px-3 py-2 text-left font-medium w-14">CCT</th>
                  <th className="px-3 py-2 text-right font-medium w-14">수량</th>
                  <th className="px-3 py-2 text-right font-medium w-20">단가</th>
                  <th className="px-3 py-2 text-right font-medium w-24">금액</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {form.items.map((item, idx) => (
                  <tr key={(item as any).id}>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={item.productName} onChange={e => updateItem(idx, 'productName', e.target.value)} placeholder="품목명" /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={(item as any).specification} onChange={e => updateItem(idx, 'specification', e.target.value)} placeholder="규격" /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={(item as any).voltage} onChange={e => updateItem(idx, 'voltage', e.target.value)} placeholder="220V" /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={(item as any).watts} onChange={e => updateItem(idx, 'watts', e.target.value)} placeholder="40W" /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={(item as any).cct} onChange={e => updateItem(idx, 'cct', e.target.value)} placeholder="4K" /></td>
                    <td className="px-2 py-1"><input type="number" className="w-full bg-transparent border-none outline-none text-xs text-right" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} /></td>
                    <td className="px-2 py-1"><input type="number" className="w-full bg-transparent border-none outline-none text-xs text-right" value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))} /></td>
                    <td className="px-2 py-1 text-right font-medium">{((item as any).amount || 0).toLocaleString()}</td>
                    <td className="px-2 py-1"><button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-2 border-t flex items-center justify-between">
              <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> 품목 추가
              </button>
              <span className="text-xs font-bold">{form.currency} {totalAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정 저장' : '저장')}
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
  const [modal, setModal] = useState<{ open: boolean; item?: Quote | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/quotes').then(r => r.json());
    if (res.data) setQuotes(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('견적을 삭제하시겠습니까?')) return;
    await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = quotes.filter(q =>
    q.businessId.includes(search) || q.companyName.includes(search) ||
    q.items.some(i => i.productName.includes(search))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="견적" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="견적번호, 거래처명 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setModal({ open: true, item: null })}>
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
                  <tr>{['견적번호', '유형', '거래처', '품목', '통화', '유효기한', '상태', '관리'].map(h => <th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', h === '관리' ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(q => (
                    <tr key={q.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{q.businessId}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', typeStyle[q.type])}>{typeLabel[q.type]}</span></td>
                      <td className="px-4 py-3 font-medium max-w-[160px] truncate">{q.companyName}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{q.items.map(i => i.productName).join(', ')}</td>
                      <td className="px-4 py-3 text-xs">{q.currency}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{q.validity ?? '-'}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusStyle[q.status])}>{statusLabel[q.status]}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: q })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(q.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
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
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-muted-foreground flex-1">{q.currency}{q.validity && ` · 유효: ${q.validity}`}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: q })}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(q.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">견적 내역이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
      {modal.open && (
        <QuoteModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
