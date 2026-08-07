'use client';

import { AppHeader } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Plus, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Product } from '@/types';

const CATEGORIES = ['조명', '가전', '전자', '생활용품', '산업용품', '기타'];

function ProductModal({ onClose, onSave }: { onClose: () => void; onSave: (p: Product) => void }) {
  const [form, setForm] = useState({ code: '', nameKo: '', nameEn: '', category: '', supplierName: '', purchasePrice: '', sellingPrice: '', currency: 'USD', moq: '', leadTimeDays: '', hsCode: '', countryOfOrigin: '중국' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameKo || !form.code) return;
    setSaving(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
          sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
          moq: form.moq ? Number(form.moq) : undefined,
          leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : undefined,
        })
      });
      const json = await res.json();
      if (json.data) onSave(json.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">제품 등록</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">품번 *</label>
              <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="LPS-401" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">카테고리</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">선택</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">제품명 (한글) *</label>
            <Input value={form.nameKo} onChange={e => setForm(f => ({ ...f, nameKo: e.target.value }))} placeholder="LED 패널 40W 1x1" required />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">제품명 (영문)</label>
            <Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="LED Panel 40W 1x1ft" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">공급업체</label>
            <Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="Ningbo Alpha Lighting" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">구매단가</label>
              <Input type="number" value={form.purchasePrice} onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))} placeholder="17.50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>USD</option><option>EUR</option><option>CNY</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">판매단가 (KRW)</label>
            <Input type="number" value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} placeholder="32000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">MOQ</label>
              <Input type="number" value={form.moq} onChange={e => setForm(f => ({ ...f, moq: e.target.value }))} placeholder="200" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">리드타임(일)</label>
              <Input type="number" value={form.leadTimeDays} onChange={e => setForm(f => ({ ...f, leadTimeDays: e.target.value }))} placeholder="45" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">HS Code</label>
              <Input value={form.hsCode} onChange={e => setForm(f => ({ ...f, hsCode: e.target.value }))} placeholder="9405.10" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">원산지</label>
              <Input value={form.countryOfOrigin} onChange={e => setForm(f => ({ ...f, countryOfOrigin: e.target.value }))} placeholder="중국" />
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

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(j => { if (j.data) setProducts(j.data); }).finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p =>
    p.nameKo.includes(search) || (p.nameEn ?? '').includes(search) || p.code.includes(search) || (p.supplierName ?? '').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="제품" />
      {showModal && <ProductModal onClose={() => setShowModal(false)} onSave={p => { setProducts(prev => [p, ...prev]); setShowModal(false); }} />}
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="제품명, 코드 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">제품 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{['코드', '제품명', '카테고리', '공급업체', '구매단가', '판매단가', 'MOQ', '리드타임'].map(h => <th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', ['구매단가', '판매단가'].includes(h) ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(p => (
                    <tr key={p.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{p.nameKo}</p>
                        {p.nameEn && <p className="text-xs text-muted-foreground">{p.nameEn}</p>}
                      </td>
                      <td className="px-4 py-3"><Badge variant="secondary" className="text-xs">{p.category ?? '-'}</Badge></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px] truncate">{p.supplierName ?? '-'}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono">{p.purchasePrice ? `${p.currency} ${Number(p.purchasePrice).toFixed(2)}` : '-'}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono">{p.sellingPrice ? `₩${Number(p.sellingPrice).toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.moq ? Number(p.moq).toLocaleString() : '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.leadTimeDays ? `${p.leadTimeDays}일` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><Package className="w-8 h-8 mx-auto mb-2 opacity-30" />제품이 없습니다.</div>}
            </div>

            <div className="md:hidden space-y-2">
              {filtered.map(p => (
                <div key={p.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{p.code}</p>
                      <p className="font-semibold text-sm mt-0.5">{p.nameKo}</p>
                      {p.nameEn && <p className="text-xs text-muted-foreground">{p.nameEn}</p>}
                    </div>
                    {p.category && <Badge variant="secondary" className="text-xs shrink-0">{p.category}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{p.supplierName}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-muted-foreground">구매단가</p>
                      <p className="font-semibold">{p.purchasePrice ? `$${p.purchasePrice}` : '-'}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-muted-foreground">판매단가</p>
                      <p className="font-semibold">{p.sellingPrice ? `₩${Number(p.sellingPrice).toLocaleString()}` : '-'}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2">
                      <p className="text-muted-foreground">MOQ</p>
                      <p className="font-semibold">{p.moq ? Number(p.moq).toLocaleString() : '-'}</p>
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">제품이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
