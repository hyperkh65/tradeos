'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Warehouse, Plus, Search, X, Pencil, Trash2, Loader2, RefreshCw, PackageCheck, PackageMinus, TrendingDown, DollarSign } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface Product { id: string; code: string; nameKo: string; nameEn?: string; }

interface InventoryItem {
  id: string; productName: string; productCode: string;
  qty: number; location: string;
  unitPrice?: number; currency: string; exchangeRate: number;
  remainValue?: number;
  memo?: string;
  outQty: number; remainQty: number;
  updatedAt: string; createdAt: string;
}

const LOCATIONS = ['본사 창고', '외부 창고', '중국 창고', '거래처 보관', '기타'];
const CURRENCIES = ['USD', 'KRW', 'CNY', 'EUR'];

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원'; }
function fmtUnit(price: number, currency: string) {
  if (currency === 'KRW') return price.toLocaleString('ko-KR');
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex-1 min-w-0">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold truncate ${color || 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function ProductAutocomplete({ value, onChange, onSelect, products }: {
  value: string; onChange: (v: string) => void; onSelect: (p: Product) => void; products: Product[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = value.trim()
    ? products.filter(p =>
        p.nameKo.toLowerCase().includes(value.toLowerCase()) ||
        (p.nameEn || '').toLowerCase().includes(value.toLowerCase()) ||
        p.code.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 12)
    : [];
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <Input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="제품명 검색..." required />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto text-sm">
          {filtered.map(p => (
            <li key={p.id} className="px-3 py-2 hover:bg-muted cursor-pointer" onMouseDown={() => { onSelect(p); setOpen(false); }}>
              <span className="font-medium">{p.nameKo}</span>
              {p.nameEn && <span className="text-muted-foreground ml-2 text-xs">{p.nameEn}</span>}
              <span className="float-right text-xs font-mono text-muted-foreground">{p.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemModal({ item, products, onClose, onSave }: {
  item?: InventoryItem | null; products: Product[]; onClose: () => void; onSave: () => void;
}) {
  const [form, setForm] = useState({
    productName: item?.productName || '',
    productCode: item?.productCode || '',
    qty: item?.qty ?? 0,
    location: item?.location || '본사 창고',
    unitPrice: item?.unitPrice ?? ('' as number | ''),
    currency: item?.currency || 'USD',
    exchangeRate: item?.exchangeRate ?? ('' as number | ''),
    memo: item?.memo || '',
  });
  const [saving, setSaving] = useState(false);

  const previewRemain = (() => {
    const qty = Number(form.qty) || 0;
    const up = form.unitPrice === '' ? null : Number(form.unitPrice);
    const er = form.exchangeRate === '' ? 1 : Number(form.exchangeRate);
    return up != null ? Math.round(qty * up * er) : null;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productName) return;
    setSaving(true);
    const payload = { ...form, unitPrice: form.unitPrice === '' ? null : Number(form.unitPrice), exchangeRate: form.exchangeRate === '' ? 1 : Number(form.exchangeRate) };
    try {
      if (item) await fetch(`/api/inventory/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      else await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">{item ? '재고 수정' : '재고 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">제품명 *</label>
              <ProductAutocomplete value={form.productName} onChange={v => setForm(f => ({ ...f, productName: v }))} onSelect={p => setForm(f => ({ ...f, productName: p.nameKo, productCode: p.code }))} products={products} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">품번 <span className="text-blue-500 text-[10px]">자동입력</span></label>
              <Input value={form.productCode} onChange={e => setForm(f => ({ ...f, productCode: e.target.value }))} placeholder="제품 선택 시 자동입력" className="bg-muted/30" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">수량</label>
              <Input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))} min={0} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">위치</label>
              <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {LOCATIONS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">매입단가</label>
              <Input type="number" step="any" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value === '' ? '' : Number(e.target.value) }))} placeholder="0" min={0} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">화폐단위</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              입고시점 환율 {form.currency === 'KRW' && <span className="text-muted-foreground text-[10px]">(KRW 고정)</span>}
            </label>
            <Input type="number" step="any" value={form.currency === 'KRW' ? 1 : form.exchangeRate}
              onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value === '' ? '' : Number(e.target.value) }))}
              placeholder="예: 1380" min={0} disabled={form.currency === 'KRW'} className={form.currency === 'KRW' ? 'bg-muted/30' : ''} />
          </div>
          {previewRemain != null && (
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 rounded-lg px-4 py-2.5 border border-blue-200 dark:border-blue-800">
              <span className="text-xs text-blue-700 dark:text-blue-300">입고기준 잔존금액</span>
              <span className="font-bold text-sm text-blue-700 dark:text-blue-300">{fmtKRW(previewRemain)}</span>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">메모</label>
            <Input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="비고사항" />
          </div>
          <div className="flex gap-2 pt-1">
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

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item?: InventoryItem | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const [invRes, prodRes] = await Promise.all([
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
    ]);
    setItems(Array.isArray(invRes.data) ? invRes.data : []);
    const prods = Array.isArray(prodRes.data) ? prodRes.data : [];
    setProducts(prods.map((p: any) => ({ id: p.id, code: p.code || p.business_id, nameKo: p.nameKo || p.name_ko, nameEn: p.nameEn || p.name_en })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('재고 항목을 삭제하시겠습니까?')) return;
    await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = items.filter(i =>
    i.productName.toLowerCase().includes(search.toLowerCase()) ||
    i.productCode.toLowerCase().includes(search.toLowerCase())
  );

  const totalIn = filtered.reduce((s, i) => s + i.qty, 0);
  const totalOut = filtered.reduce((s, i) => s + i.outQty, 0);
  const totalRemain = filtered.reduce((s, i) => s + i.remainQty, 0);
  const totalValue = filtered.reduce((s, i) => s + (i.remainValue ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="재고 관리" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="등록 품목" value={`${filtered.length}종`} />
          <StatCard label="총 입고" value={totalIn.toLocaleString()} sub="수량" />
          <StatCard label="총 출고" value={totalOut.toLocaleString()} sub="수량" color={totalOut > 0 ? 'text-orange-600' : undefined} />
          <StatCard label="잔여 수량" value={totalRemain.toLocaleString()} sub={totalValue > 0 ? `잔존 ${fmtKRW(totalValue)}` : undefined} color={totalRemain < 0 ? 'text-red-500' : 'text-green-600'} />
        </div>

        {/* Search + actions */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9 h-10" placeholder="제품명, 품번 검색..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-10 gap-1 shrink-0" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">새로고침</span>
          </Button>
          <Button size="sm" className="h-10 gap-1 shrink-0" onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">재고 등록</span>
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">제품명</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">품번</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">입고</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">출고</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">잔여</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">매입단가</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">환율</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">잔존금액(₩)</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">위치</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">메모</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground w-16">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-16 text-muted-foreground text-sm">
                    {search ? '검색 결과가 없습니다.' : '등록된 재고가 없습니다. 재고 등록 버튼을 눌러 추가하세요.'}
                  </td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium">{item.productName}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{item.productCode || '-'}</td>
                    <td className="px-3 py-2.5 text-right">{item.qty.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">
                      {item.outQty > 0
                        ? <span className="text-orange-600 font-medium">{item.outQty.toLocaleString()}</span>
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-bold text-sm ${item.remainQty <= 0 ? 'text-red-500' : item.remainQty < 10 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {item.remainQty.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-mono">
                      {item.unitPrice != null
                        ? <>{fmtUnit(item.unitPrice, item.currency)} <span className="text-muted-foreground">{item.currency}</span></>
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                      {item.currency !== 'KRW' && item.unitPrice != null ? item.exchangeRate.toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-mono">
                      {item.remainValue != null
                        ? <span className={item.remainValue <= 0 ? 'text-red-500' : 'text-blue-700 dark:text-blue-400 font-semibold'}>{item.remainValue.toLocaleString()}</span>
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">{item.location}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[120px] truncate">{item.memo || '-'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDelete(item.id)}>
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
        <ItemModal item={modal.item} products={products} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
