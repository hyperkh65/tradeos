'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Warehouse, Plus, Search, X, Pencil, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface Product {
  id: string; code: string; nameKo: string; nameEn?: string;
}

interface InventoryItem {
  id: string; productName: string; productCode: string;
  qty: number; location: string;
  purchasePrice?: number; currency: string;
  memo?: string;
  outQty: number; remainQty: number;
  updatedAt: string; createdAt: string;
}

const LOCATIONS = ['본사 창고', '외부 창고', '중국 창고', '거래처 보관', '기타'];
const CURRENCIES = ['USD', 'KRW', 'CNY', 'EUR'];

function fmtPrice(price: number, currency: string) {
  if (currency === 'KRW') return price.toLocaleString('ko-KR') + ' 원';
  if (currency === 'CNY') return '¥ ' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'EUR') return '€ ' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '$ ' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ProductAutocomplete({
  value, onChange, onSelect, products
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (p: Product) => void;
  products: Product[];
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
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="제품명 검색..."
        required
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg max-h-56 overflow-y-auto text-sm">
          {filtered.map(p => (
            <li
              key={p.id}
              className="px-3 py-2 hover:bg-muted cursor-pointer"
              onMouseDown={() => { onSelect(p); setOpen(false); }}
            >
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

function ItemModal({
  item, products, onClose, onSave
}: {
  item?: InventoryItem | null;
  products: Product[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    productName: item?.productName || '',
    productCode: item?.productCode || '',
    qty: item?.qty ?? 0,
    location: item?.location || '본사 창고',
    purchasePrice: item?.purchasePrice ?? ('' as number | ''),
    currency: item?.currency || 'USD',
    memo: item?.memo || '',
  });
  const [saving, setSaving] = useState(false);

  const handleProductSelect = (p: Product) => {
    setForm(f => ({ ...f, productName: p.nameKo, productCode: p.code }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productName) return;
    setSaving(true);
    const payload = {
      ...form,
      purchasePrice: form.purchasePrice === '' ? null : Number(form.purchasePrice),
    };
    try {
      if (item) {
        await fetch(`/api/inventory/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-base">{item ? '재고 수정' : '재고 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* 제품명 (autocomplete) + 품번 (auto) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">제품명 *</label>
              <ProductAutocomplete
                value={form.productName}
                onChange={v => setForm(f => ({ ...f, productName: v }))}
                onSelect={handleProductSelect}
                products={products}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">품번 <span className="text-blue-500">(자동)</span></label>
              <Input
                value={form.productCode}
                onChange={e => setForm(f => ({ ...f, productCode: e.target.value }))}
                placeholder="제품 선택 시 자동입력"
                className="bg-muted/40"
              />
            </div>
          </div>

          {/* 수량 + 위치 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">수량</label>
              <Input
                type="number"
                value={form.qty}
                onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))}
                min={0}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">위치</label>
              <select
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* 매입금액 + 화폐단위 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">매입금액</label>
              <Input
                type="number"
                step="any"
                value={form.purchasePrice}
                onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value === '' ? '' : Number(e.target.value) }))}
                placeholder="0"
                min={0}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">화폐단위</label>
              <select
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">메모</label>
            <Input
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              placeholder="비고사항"
            />
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

  const totalQty = filtered.reduce((s, i) => s + i.qty, 0);
  const totalRemain = filtered.reduce((s, i) => s + i.remainQty, 0);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="재고 관리" icon={<Warehouse className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="제품명, 품번 검색..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {filtered.length}종 / 입고 {totalQty.toLocaleString()} / 잔여 <span className={totalRemain < 0 ? 'text-red-500 font-bold' : 'text-green-600 font-bold'}>{totalRemain.toLocaleString()}</span>
          </div>
          <Button onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4 mr-1" /> 재고 등록
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">제품명</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">품번</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">입고</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">출고</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">잔여</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">위치</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">매입금액</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">메모</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">재고 데이터가 없습니다.</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{item.productName}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.productCode || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{item.qty.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {item.outQty > 0
                        ? <span className="text-orange-600 font-medium">{item.outQty.toLocaleString()}</span>
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${item.remainQty <= 0 ? 'text-red-500' : item.remainQty < 10 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {item.remainQty.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200">{item.location}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {item.purchasePrice != null
                        ? <span className="font-mono">{fmtPrice(item.purchasePrice, item.currency)}</span>
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-32 truncate">{item.memo || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
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
        <ItemModal
          item={modal.item}
          products={products}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }}
        />
      )}
    </div>
  );
}
