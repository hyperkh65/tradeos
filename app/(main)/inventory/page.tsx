'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Warehouse, Plus, Search, X, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

interface InventoryItem {
  id: string; productName: string; productCode: string;
  qty: number; location: string; memo?: string;
  updatedAt: string; createdAt: string;
}

const LOCATIONS = ['본사 창고', '외부 창고', '중국 창고', '거래처 보관', '기타'];

function ItemModal({ item, onClose, onSave }: { item?: InventoryItem | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    productName: item?.productName || '',
    productCode: item?.productCode || '',
    qty: item?.qty ?? 0,
    location: item?.location || '본사 창고',
    memo: item?.memo || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productName) return;
    setSaving(true);
    try {
      if (item) {
        await fetch(`/api/inventory/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      } else {
        await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">{item ? '재고 수정' : '재고 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">제품명 *</label>
              <Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">품번</label>
              <Input value={form.productCode} onChange={e => setForm(f => ({ ...f, productCode: e.target.value }))} placeholder="LPS-401" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">수량</label>
              <Input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">위치</label>
              <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">메모</label>
            <Input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="비고사항" />
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

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item?: InventoryItem | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/inventory').then(r => r.json());
    setItems(Array.isArray(res.data) ? res.data : []);
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

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="재고 관리" icon={<Warehouse className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="제품명, 품번 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="text-sm text-muted-foreground">총 {filtered.length}종 / {totalQty.toLocaleString()}개</div>
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
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">수량</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">위치</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">메모</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">재고 데이터가 없습니다.</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{item.productName}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.productCode || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${item.qty <= 0 ? 'text-red-500' : item.qty < 10 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {item.qty.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200">{item.location}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{item.memo || '-'}</td>
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
        <ItemModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
