'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShoppingCart, Plus, Search, X, Pencil, Trash2, Loader2, Printer } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface SalesItem { id: string; product: string; specification: string; qty: number; unitPrice: number; amount: number; }
interface SalesRecord {
  id: string; businessId: string; saleDate: string; customer: string;
  saleType: string; salesperson?: string; poNo?: string;
  items: SalesItem[]; netAmount: number; vat: number; totalAmount: number; currency: string;
}

const SALE_TYPES = ['일반', '직수출', '내수', '샘플', '반품'];
const emptyItem = (): SalesItem => ({ id: Date.now().toString(), product: '', specification: '', qty: 1, unitPrice: 0, amount: 0 });

function SaleModal({ sale, companies, onClose, onSave }: { sale?: SalesRecord | null; companies: string[]; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    saleDate: sale?.saleDate || new Date().toISOString().slice(0, 10),
    customer: sale?.customer || '',
    saleType: sale?.saleType || '일반',
    salesperson: sale?.salesperson || '',
    poNo: sale?.poNo || '',
    items: sale?.items?.length ? sale.items.map((i, idx) => ({ ...i, id: String(idx) })) : [emptyItem()],
    currency: sale?.currency || 'KRW',
  });
  const [saving, setSaving] = useState(false);

  const updateItem = (idx: number, field: string, val: string | number) => {
    const items = [...form.items];
    (items[idx] as any)[field] = val;
    if (field === 'qty' || field === 'unitPrice') {
      items[idx].amount = items[idx].qty * items[idx].unitPrice;
    }
    setForm(f => ({ ...f, items }));
  };

  const netAmount = form.items.reduce((s, i) => s + i.amount, 0);
  const vat = Math.round(netAmount * 0.1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer) return;
    setSaving(true);
    try {
      const body = { ...form, netAmount, vat, totalAmount: netAmount + vat };
      if (sale) await fetch(`/api/sales/${sale.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      else await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">{sale ? '매출 수정' : '매출 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">매출일자</label>
              <Input type="date" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">거래처 *</label>
              <Input value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} list="cust-list" required />
              <datalist id="cust-list">{companies.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">매출유형</label>
              <select value={form.saleType} onChange={e => setForm(f => ({ ...f, saleType: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {SALE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">담당자</label>
              <Input value={form.salesperson} onChange={e => setForm(f => ({ ...f, salesperson: e.target.value }))} /></div>
          </div>

          {/* Items */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">품목</th>
                  <th className="px-3 py-2 text-left font-medium">규격</th>
                  <th className="px-3 py-2 text-right font-medium w-16">수량</th>
                  <th className="px-3 py-2 text-right font-medium w-24">단가</th>
                  <th className="px-3 py-2 text-right font-medium w-28">금액</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {form.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={item.product} onChange={e => updateItem(idx, 'product', e.target.value)} placeholder="품목명" /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={item.specification} onChange={e => updateItem(idx, 'specification', e.target.value)} placeholder="규격" /></td>
                    <td className="px-2 py-1"><input type="number" className="w-full bg-transparent border-none outline-none text-xs text-right" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} /></td>
                    <td className="px-2 py-1"><input type="number" className="w-full bg-transparent border-none outline-none text-xs text-right" value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))} /></td>
                    <td className="px-2 py-1 text-right font-medium">{item.amount.toLocaleString()}</td>
                    <td className="px-2 py-1"><button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-2 border-t">
              <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> 품목 추가
              </button>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="space-y-1 text-sm w-56">
              <div className="flex justify-between"><span className="text-muted-foreground">공급가액</span><span>{netAmount.toLocaleString()}원</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">부가세(10%)</span><span>{vat.toLocaleString()}원</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>합계</span><span>{(netAmount + vat).toLocaleString()}원</span></div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (sale ? '수정 저장' : '매출 등록')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CRMPage() {
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; sale?: SalesRecord | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const [sRes, cRes] = await Promise.all([
      fetch('/api/sales').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
    ]);
    setSales(Array.isArray(sRes.data) ? sRes.data : []);
    setCompanies((Array.isArray(cRes.data) ? cRes.data : []).map((c: any) => c.name));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/sales/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = sales.filter(s =>
    s.customer.toLowerCase().includes(search.toLowerCase()) ||
    s.businessId.toLowerCase().includes(search.toLowerCase())
  );

  const totalNet = filtered.reduce((s, r) => s + r.netAmount, 0);
  const totalVat = filtered.reduce((s, r) => s + r.vat, 0);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="매출 관리 (CRM)" icon={<ShoppingCart className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="거래처, 코드 검색..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5">
            <span>공급가 합계: <strong className="text-foreground">{totalNet.toLocaleString()}원</strong></span>
            <span>부가세 합계: <strong className="text-foreground">{totalVat.toLocaleString()}원</strong></span>
          </div>
          <Button onClick={() => setModal({ open: true, sale: null })}>
            <Plus className="w-4 h-4 mr-1" /> 매출 등록
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">코드</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">일자</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">거래처</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">유형</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">담당자</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">공급가액</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">부가세</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">합계</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">매출 데이터가 없습니다.</td></tr>
                ) : filtered.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.businessId}</td>
                    <td className="px-4 py-3 text-sm">{s.saleDate}</td>
                    <td className="px-4 py-3 font-medium">{s.customer}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs border border-green-200">{s.saleType}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{s.salesperson || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{s.netAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{s.vat.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-bold">{s.totalAmount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, sale: s })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(s.id)}>
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
        <SaleModal sale={modal.sale} companies={companies} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
