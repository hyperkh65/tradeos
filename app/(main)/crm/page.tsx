'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShoppingCart, Plus, Search, X, Pencil, Trash2, Loader2, Printer, Lock, Maximize2, PackageMinus } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';

const ADMIN_PASSWORD = '1209';
const SALE_TYPES = ['일반', '직수출', '내수', '샘플', '반품'];

function isPrevMonth(d?: string) {
  if (!d) return false;
  const t = new Date(d), n = new Date();
  return t.getFullYear() < n.getFullYear() || (t.getFullYear() === n.getFullYear() && t.getMonth() < n.getMonth());
}

interface SalesItem {
  id: string; product: string; specification: string;
  qty: number; unitPrice: number; amount: number; remark: string;
  supplierName?: string; poId?: string; poBusinessId?: string;
  inventoryDeducted?: boolean;
}
interface SalesRecord {
  id: string; businessId: string; saleDate: string; customer: string;
  saleType: string; salesperson?: string; poNo?: string;
  items: SalesItem[]; netAmount: number; vat: number; totalAmount: number;
  currency: string; exchangeRate?: number; misc?: string;
  supplierId?: string; supplierName?: string;
  poId?: string; poBusinessId?: string;
}
interface Company {
  id: string; businessId: string; name: string; type: string; country: string;
  ceo?: string; businessNo?: string; address?: string; phone?: string; email?: string;
}
interface CompanySettings { name: string; ceo: string; bizNo: string; bizType: string; bizItem: string; address: string; tel: string; fax: string; email: string; bank: string; bankForeign1: string; bankForeign2: string; logoUrl: string; stampUrl: string; }

const emptyItem = (): SalesItem => ({
  id: Date.now().toString() + Math.random(),
  product: '', specification: '', qty: 1, unitPrice: 0, amount: 0, remark: '',
  supplierName: '', poId: '', poBusinessId: '', inventoryDeducted: false,
});

function AdminPasswordModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(false);
  const check = () => { if (pw === ADMIN_PASSWORD) onConfirm(); else setErr(true); };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-xl shadow-2xl p-6 w-80">
        <div className="flex items-center gap-2 mb-3"><Lock className="w-5 h-5 text-orange-500" /><h3 className="font-semibold">전월 매출 수정</h3></div>
        <p className="text-sm text-muted-foreground mb-4">전월 매출은 관리자만 수정할 수 있습니다.<br />관리자 비밀번호를 입력하세요.</p>
        <Input type="password" placeholder="비밀번호" value={pw} onChange={e => { setPw(e.target.value); setErr(false); }} onKeyDown={e => e.key === 'Enter' && check()} className={err ? 'border-red-400' : ''} autoFocus />
        {err && <p className="text-xs text-red-500 mt-1">비밀번호가 올바르지 않습니다.</p>}
        <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={onCancel}>취소</Button><Button className="flex-1" onClick={check}>확인</Button></div>
      </div>
    </div>
  );
}

function SpecModal({ value, onSave, onClose }: { value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">규격 입력</h3>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <textarea autoFocus rows={5} value={text} onChange={e => setText(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="규격을 입력하세요..." />
        <div className="flex gap-2 mt-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button type="button" className="flex-1" onClick={() => { onSave(text); onClose(); }}>확인</Button>
        </div>
      </div>
    </div>
  );
}

function SaleProductSearch({ value, products, allSales, onSelect }: {
  value: string; products: any[]; allSales: SalesRecord[];
  onSelect: (name: string, unitPrice: number, specification: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 280 });
  const anchorRef = useRef<HTMLDivElement>(null);
  const lower = value.toLowerCase();
  const matched = value.length >= 1
    ? products.filter(p => (p.nameKo || '').toLowerCase().includes(lower) || (p.code || '').toLowerCase().includes(lower)).slice(0, 12)
    : [];
  const getRecentPrice = (name: string) => {
    const prices = allSales.flatMap(s => s.items.filter(i => i.product === name).map(i => ({ price: i.unitPrice, date: s.saleDate }))).filter(p => p.price > 0).sort((a, b) => b.date.localeCompare(a.date));
    return prices[0]?.price ?? null;
  };
  useEffect(() => {
    if (matched.length > 0 && anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: Math.max(280, r.width) });
      setShow(true);
    } else setShow(false);
  }, [value, matched.length]);
  return (
    <div ref={anchorRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {show && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-background border border-border rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          {matched.map(p => {
            const recent = getRecentPrice(p.nameKo);
            return (
              <button key={p.id} type="button" onMouseDown={e => e.preventDefault()}
                onClick={() => { onSelect(p.nameKo, recent ?? p.sellingPrice ?? 0, p.sizeSpec || ''); setShow(false); }}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 text-xs flex items-center justify-between gap-2">
                <span className="font-medium truncate">{p.nameKo}</span>
                {recent != null && <span className="text-blue-500 shrink-0">최근 {recent.toLocaleString()}</span>}
              </button>
            );
          })}
        </div>, document.body
      )}
    </div>
  );
}

function POPreviewPanel({ po, anchorRect, onClose }: { po: any; anchorRect: DOMRect; onClose: () => void }) {
  const panelWidth = 330;
  const spaceRight = window.innerWidth - anchorRect.right - 12;
  const left = spaceRight >= panelWidth ? anchorRect.right + 8 : anchorRect.left - panelWidth - 8;
  const top = Math.min(anchorRect.top, window.innerHeight - 400);
  const items: any[] = po.items || [];
  const total = items.reduce((s: number, i: any) => s + (i.amount || 0), 0);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div style={{ position: 'fixed', top: Math.max(8, top), left: Math.max(8, left), width: panelWidth, zIndex: 9999 }}
        className="bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <div>
            <span className="text-xs font-semibold">{po.businessId}</span>
            <span className="text-[10px] text-muted-foreground ml-2">{po.supplierName} · {po.orderDate}</span>
          </div>
          <button onClick={onClose}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
        </div>
        <div className="p-2 max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground text-[10px]">
                <th className="text-left pb-1.5 font-medium">품목명</th>
                <th className="text-right pb-1.5 font-medium">수량</th>
                <th className="text-right pb-1.5 font-medium">단가</th>
                <th className="text-right pb-1.5 font-medium">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item: any, i: number) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2">
                    <div className="font-medium leading-tight">{item.productName}</div>
                    {item.specification && <div className="text-muted-foreground text-[10px] leading-tight mt-0.5">{item.specification}</div>}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">{(item.qty || 0).toLocaleString()}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">{(item.unitPrice || 0).toLocaleString()}</td>
                  <td className="py-1.5 text-right font-medium whitespace-nowrap">{(item.amount || 0).toLocaleString()}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">품목 없음</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t px-3 py-2 flex justify-between text-xs font-semibold bg-muted/20">
          <span className="text-muted-foreground">{items.length}개 품목</span>
          <span>{total.toLocaleString()} {po.currency || 'USD'}</span>
        </div>
      </div>
    </>,
    document.body
  );
}

function SaleModal({ sale, companies, products, purchaseOrders, sales: allSales, onClose, onSave }: {
  sale?: SalesRecord | null; companies: Company[]; products: any[];
  purchaseOrders: any[]; sales: SalesRecord[]; onClose: () => void; onSave: () => void;
}) {
  const [form, setForm] = useState({
    saleDate: sale?.saleDate || new Date().toISOString().slice(0, 10),
    customer: sale?.customer || '',
    saleType: sale?.saleType || '일반',
    salesperson: sale?.salesperson || '',
    poNo: sale?.poNo || '',
    currency: sale?.currency || 'KRW',
    exchangeRate: String(sale?.exchangeRate ?? 1),
    misc: sale?.misc || '',
    items: sale?.items?.length
      ? sale.items.map((i, idx) => ({
          ...i, id: String(idx), remark: (i as any).remark || '',
          supplierName: (i as any).supplierName || sale.supplierName || '',
          poId: (i as any).poId || sale.poId || '',
          poBusinessId: (i as any).poBusinessId || sale.poBusinessId || '',
          inventoryDeducted: (i as any).inventoryDeducted ?? false,
        }))
      : [emptyItem()],
  });

  // Batch-apply state (not saved directly — only for applying to all items)
  const [batchSupplier, setBatchSupplier] = useState(sale?.supplierName || '');
  const [batchPo, setBatchPo] = useState(sale?.poBusinessId || '');

  const [saving, setSaving] = useState(false);
  const [specModal, setSpecModal] = useState<{ open: boolean; idx: number; value: string }>({ open: false, idx: 0, value: '' });
  const [poPreview, setPoPreview] = useState<{ po: any; anchorRect: DOMRect } | null>(null);

  const showPoPreview = (businessId: string, el: HTMLElement) => {
    const po = purchaseOrders.find(p => p.businessId === businessId);
    if (po) setPoPreview({ po, anchorRect: el.getBoundingClientRect() });
    else setPoPreview(null);
  };

  const applyBatchToAll = () => {
    const po = purchaseOrders.find(p => p.businessId === batchPo);
    setForm(f => ({
      ...f,
      items: f.items.map(item => ({
        ...item,
        supplierName: batchSupplier,
        poId: po?.id || '',
        poBusinessId: batchPo,
      })),
    }));
  };

  const updateItem = (idx: number, field: string, val: string | number | boolean) => {
    const items = [...form.items];
    (items[idx] as any)[field] = val;
    if (field === 'qty' || field === 'unitPrice') items[idx].amount = items[idx].qty * items[idx].unitPrice;
    setForm(f => ({ ...f, items }));
  };

  const autoFillProduct = (idx: number, productName: string) => {
    const prod = products.find(p => p.nameKo === productName);
    if (!prod) return;
    const items = [...form.items];
    if (!items[idx].specification && prod.sizeSpec) items[idx].specification = prod.sizeSpec;
    if (items[idx].unitPrice === 0 && prod.sellingPrice) {
      items[idx].unitPrice = prod.sellingPrice;
      items[idx].amount = items[idx].qty * prod.sellingPrice;
    }
    setForm(f => ({ ...f, items }));
  };

  const getRecentPrice = (productName: string) => {
    if (!productName) return null;
    const prices = allSales.flatMap(s => s.items.filter(i => i.product === productName).map(i => ({ price: i.unitPrice, date: s.saleDate }))).filter(p => p.price > 0).sort((a, b) => b.date.localeCompare(a.date));
    return prices[0]?.price ?? null;
  };

  const rate = Number(form.exchangeRate) || 1;
  const netAmount = form.items.reduce((s, i) => s + i.amount, 0);
  const netKRW = rate === 1 ? netAmount : Math.round(netAmount * rate);
  const vat = Math.round(netKRW * 0.1);
  const deductedItems = form.items.filter(i => i.inventoryDeducted).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer) return;
    setSaving(true);
    try {
      const body = { ...form, exchangeRate: rate, netAmount, vat, totalAmount: netKRW + vat };
      if (sale) await fetch(`/api/sales/${sale.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      else await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">{sale ? '매출 수정' : '매출 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Row 1: 날짜, 거래처, 유형, 담당자 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">매출일자</label>
              <Input type="date" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">거래처 *</label>
              <Input value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} list="cust-list" required />
              <datalist id="cust-list">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">매출유형</label>
              <select value={form.saleType} onChange={e => setForm(f => ({ ...f, saleType: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {SALE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">담당자</label>
              <Input value={form.salesperson} onChange={e => setForm(f => ({ ...f, salesperson: e.target.value }))} />
            </div>
          </div>

          {/* Row 2: 고객PO번호, 통화, 환율, 기타 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">고객 PO번호</label>
              <Input value={form.poNo} onChange={e => setForm(f => ({ ...f, poNo: e.target.value }))} placeholder="PO번호" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>KRW</option><option>USD</option><option>CNY</option><option>EUR</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                적용환율 <span className="text-[10px] text-muted-foreground/70">(1=국내거래)</span>
              </label>
              <Input type="number" step="0.0001" min="0.0001" value={form.exchangeRate}
                onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} placeholder="1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">기타 사항</label>
              <Input value={form.misc} onChange={e => setForm(f => ({ ...f, misc: e.target.value }))} placeholder="특이사항, 참고사항 등" />
            </div>
          </div>

          {/* 일괄 적용 (공급사 + 발주번호 → 모든 아이템에 적용) */}
          <div className="flex items-end gap-2 p-3 bg-muted/30 rounded-lg border border-dashed">
            <div className="text-xs font-medium text-muted-foreground shrink-0 pb-1">일괄 적용</div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground mb-1 block">공급사</label>
              <Input value={batchSupplier} onChange={e => { setBatchSupplier(e.target.value); setBatchPo(''); setPoPreview(null); }}
                list="batch-supplier-list" placeholder="공급사 선택..." className="h-8 text-xs" />
              <datalist id="batch-supplier-list">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground mb-1 block">
                내부 발주번호
                {batchSupplier && <span className="text-blue-500 ml-1">({purchaseOrders.filter(p => p.supplierName === batchSupplier).length}건)</span>}
              </label>
              <select value={batchPo}
                onChange={e => { setBatchPo(e.target.value); if (e.target.value) showPoPreview(e.target.value, e.currentTarget); else setPoPreview(null); }}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                <option value="">-- 선택 --</option>
                {purchaseOrders
                  .filter(po => !batchSupplier || po.supplierName === batchSupplier)
                  .map(po => (
                    <option key={po.id} value={po.businessId}>
                      {po.businessId} | {po.supplierName} | {po.orderDate}
                    </option>
                  ))}
              </select>
            </div>
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={applyBatchToAll}>
              모두 적용
            </Button>
          </div>

          {/* Items table */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium w-[180px]">품목명</th>
                  <th className="px-2 py-2 text-left font-medium w-[110px]">규격</th>
                  <th className="px-2 py-2 text-right font-medium w-14">수량</th>
                  <th className="px-2 py-2 text-right font-medium w-32">
                    단가 <span className="text-[9px] text-blue-500 font-normal">(최근↓ 클릭적용)</span>
                  </th>
                  <th className="px-2 py-2 text-right font-medium w-24">금액</th>
                  <th className="px-2 py-2 text-left font-medium w-[90px]">비고</th>
                  <th className="px-2 py-2 text-left font-medium w-[140px]">
                    공급사 <span className="text-[9px] font-normal text-muted-foreground">(아이템별)</span>
                  </th>
                  <th className="px-2 py-2 text-left font-medium w-[170px]">
                    발주번호 <span className="text-[9px] font-normal text-muted-foreground">(아이템별)</span>
                  </th>
                  <th className="px-2 py-2 text-center font-medium w-14">
                    <span className="flex flex-col items-center leading-tight">
                      <PackageMinus className="w-3 h-3 mb-0.5" />
                      재고처리
                    </span>
                  </th>
                  <th className="px-2 py-2 w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {form.items.map((item, idx) => {
                  const recentPrice = getRecentPrice(item.product);
                  return (
                    <tr key={item.id} className={`hover:bg-muted/20 ${item.inventoryDeducted ? 'bg-orange-50/40 dark:bg-orange-950/10' : ''}`}>
                      <td className="px-2 py-1">
                        <div className="relative">
                          <input className="w-full bg-transparent border-none outline-none text-xs"
                            value={item.product}
                            onChange={e => updateItem(idx, 'product', e.target.value)}
                            onBlur={e => autoFillProduct(idx, e.target.value)}
                            placeholder="품목명" />
                          <SaleProductSearch value={item.product} products={products} allSales={allSales}
                            onSelect={(name, price, spec) => {
                              const items = [...form.items];
                              items[idx].product = name;
                              if (!items[idx].specification && spec) items[idx].specification = spec;
                              if (items[idx].unitPrice === 0 && price > 0) { items[idx].unitPrice = price; items[idx].amount = items[idx].qty * price; }
                              setForm(f => ({ ...f, items }));
                            }} />
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-0.5">
                          <input className="flex-1 bg-transparent border-none outline-none text-xs min-w-0"
                            value={item.specification} onChange={e => updateItem(idx, 'specification', e.target.value)} placeholder="규격" />
                          <button type="button" onClick={() => setSpecModal({ open: true, idx, value: item.specification })}
                            className="shrink-0 text-muted-foreground hover:text-primary">
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" className="w-full bg-transparent border-none outline-none text-xs text-right"
                          value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" step="0.01" className="w-full bg-transparent border-none outline-none text-xs text-right"
                          value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))} />
                        {recentPrice != null && (
                          <div className="text-right">
                            <button type="button" className="text-[9px] text-blue-500 hover:underline"
                              onClick={() => updateItem(idx, 'unitPrice', recentPrice)}>
                              최근: {recentPrice.toLocaleString()}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right font-medium">{item.amount.toLocaleString()}</td>
                      <td className="px-1 py-1">
                        <input className="w-full bg-transparent border-none outline-none text-xs"
                          value={item.remark} onChange={e => updateItem(idx, 'remark', e.target.value)} placeholder="비고" />
                      </td>
                      {/* 공급사 (per-item) */}
                      <td className="px-1 py-1">
                        <input className="w-full bg-transparent border-none outline-none text-xs border-b border-dashed border-muted-foreground/30"
                          value={item.supplierName || ''}
                          onChange={e => { updateItem(idx, 'supplierName', e.target.value); updateItem(idx, 'poBusinessId', ''); updateItem(idx, 'poId', ''); setPoPreview(null); }}
                          list={`supplier-list-${idx}`} placeholder="공급사..." />
                        <datalist id={`supplier-list-${idx}`}>{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
                      </td>
                      {/* 발주번호 (per-item, 공급사 필터) */}
                      <td className="px-1 py-1">
                        <select value={item.poBusinessId || ''}
                          onChange={e => {
                            const po = purchaseOrders.find(p => p.businessId === e.target.value);
                            updateItem(idx, 'poBusinessId', e.target.value);
                            updateItem(idx, 'poId', po?.id || '');
                            if (e.target.value) showPoPreview(e.target.value, e.currentTarget);
                            else setPoPreview(null);
                          }}
                          className="w-full bg-transparent border-none outline-none text-xs text-muted-foreground cursor-pointer">
                          <option value="">-- 선택 --</option>
                          {purchaseOrders
                            .filter(po => !item.supplierName || po.supplierName === item.supplierName)
                            .map(po => (
                              <option key={po.id} value={po.businessId}>
                                {po.businessId} | {po.supplierName}
                              </option>
                            ))}
                        </select>
                      </td>
                      {/* 재고처리 체크박스 */}
                      <td className="px-2 py-1 text-center">
                        <label className="flex flex-col items-center gap-0.5 cursor-pointer">
                          <input type="checkbox" checked={!!item.inventoryDeducted}
                            onChange={e => updateItem(idx, 'inventoryDeducted', e.target.checked)}
                            className="w-4 h-4 accent-orange-500 cursor-pointer" />
                          {item.inventoryDeducted && <span className="text-[9px] text-orange-600 font-medium">출고</span>}
                        </label>
                      </td>
                      <td className="px-1 py-1">
                        <button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                          className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="p-2 border-t flex items-center justify-between">
              <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> 품목 추가
              </button>
              {deductedItems > 0 && (
                <span className="text-xs text-orange-600 flex items-center gap-1">
                  <PackageMinus className="w-3 h-3" /> {deductedItems}개 품목 재고 출고 처리
                </span>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="space-y-1 text-sm w-72">
              <div className="flex justify-between">
                <span className="text-muted-foreground">공급가액</span>
                <span>
                  {netAmount.toLocaleString()}
                  {rate !== 1 && <span className="text-muted-foreground text-xs"> × {rate} = {netKRW.toLocaleString()}원</span>}
                  {rate === 1 && '원'}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">부가세 (10%)</span><span>{vat.toLocaleString()}원</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>합계</span><span>{(netKRW + vat).toLocaleString()}원</span></div>
            </div>
          </div>

          {specModal.open && (
            <SpecModal value={specModal.value}
              onSave={v => updateItem(specModal.idx, 'specification', v)}
              onClose={() => setSpecModal({ open: false, idx: 0, value: '' })} />
          )}
          {poPreview && (
            <POPreviewPanel po={poPreview.po} anchorRect={poPreview.anchorRect} onClose={() => setPoPreview(null)} />
          )}
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

/* ─── 거래명세표 인쇄 모달 ───────────────────────────────────────────────── */

function SalePrintModal({ sale, company, companies, onClose }: {
  sale: SalesRecord; company: CompanySettings; companies: Company[]; onClose: () => void;
}) {
  const items = sale.items || [];
  const rate = Number(sale.exchangeRate) || 1;
  const netAmount = items.reduce((s, i) => s + i.amount, 0);
  const netKRW = rate === 1 ? netAmount : Math.round(netAmount * rate);
  const vat = sale.vat ?? Math.round(netKRW * 0.1);
  const total = sale.totalAmount ?? netKRW + vat;
  const customerCo = companies.find(c => c.name === sale.customer);
  const MIN_ROWS = 10;
  const emptyRows = Math.max(0, MIN_ROWS - items.length);

  const handlePrint = () => {
    const orig = document.title;
    document.title = `${sale.businessId}_${sale.customer}_${sale.saleDate}`.replace(/\s/g, '_');
    window.print();
    window.addEventListener('afterprint', () => { document.title = orig; }, { once: true });
  };

  const td: React.CSSProperties = { padding: '6px 8px', border: '1px solid #e0e0e0', verticalAlign: 'middle' };
  const th: React.CSSProperties = { padding: '8px', backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #ddd', fontWeight: '600', fontSize: '8.5pt' };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #sale-print-area, #sale-print-area * { visibility: visible !important; }
          #sale-print-area { position: fixed; left: 0; top: 0; width: 210mm; padding: 10mm !important; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
      <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[900px]">
          <div className="flex items-center justify-between p-4 border-b no-print">
            <span className="font-semibold text-sm text-gray-800">거래명세표 미리보기</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> 인쇄 / PDF 저장</Button>
              <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>
          </div>
          <div id="sale-print-area" style={{ width: '210mm', minHeight: '297mm', padding: '12mm', background: 'white', fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif', color: '#111', fontSize: '9pt', lineHeight: '1.5', boxSizing: 'border-box' }}>
            {/* 제목 */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '22pt', fontWeight: '800', letterSpacing: '12px', color: '#222' }}>거 래 명 세 표</div>
              <div style={{ fontSize: '8.5pt', color: '#888', marginTop: '4px', letterSpacing: '1px' }}>TRANSACTION STATEMENT</div>
            </div>

            {/* 문서정보 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '8.5pt', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div><span style={{ color: '#888' }}>문서번호 </span><strong>{sale.businessId}</strong></div>
                <div><span style={{ color: '#888' }}>거래일자 </span><strong>{sale.saleDate}</strong></div>
                <div><span style={{ color: '#888' }}>거래유형 </span><strong>{sale.saleType}</strong></div>
              </div>
              {sale.poNo && <div><span style={{ color: '#888' }}>PO# </span><strong>{sale.poNo}</strong></div>}
            </div>

            {/* 공급자 / 공급받는자 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ textAlign: 'center', fontWeight: '600', fontSize: '8pt', background: '#f5f5f5', padding: '6px', borderBottom: '1px solid #ddd', letterSpacing: '4px', color: '#444' }}>공 급 자</div>
                <div style={{ padding: '10px', fontSize: '8pt' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                    <tr><td style={{ color: '#888', width: '70px', paddingBottom: '3px', verticalAlign: 'top' }}>상호</td><td style={{ fontWeight: '700', fontSize: '10pt' }}>{company.name}</td></tr>
                    {company.bizNo && <tr><td style={{ color: '#888', paddingBottom: '3px' }}>사업자번호</td><td>{company.bizNo}</td></tr>}
                    {company.ceo && <tr><td style={{ color: '#888', paddingBottom: '3px' }}>대표자</td><td>{company.ceo}</td></tr>}
                    {company.address && <tr><td style={{ color: '#888', paddingBottom: '3px', verticalAlign: 'top' }}>주소</td><td style={{ fontSize: '7.5pt' }}>{company.address}</td></tr>}
                    {company.tel && <tr><td style={{ color: '#888', paddingBottom: '3px' }}>전화</td><td>{company.tel}</td></tr>}
                  </tbody></table>
                </div>
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ textAlign: 'center', fontWeight: '600', fontSize: '8pt', background: '#f5f5f5', padding: '6px', borderBottom: '1px solid #ddd', letterSpacing: '3px', color: '#444' }}>공 급 받 는 자</div>
                <div style={{ padding: '10px', fontSize: '8pt' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
                    <tr><td style={{ color: '#888', width: '70px', paddingBottom: '3px', verticalAlign: 'top' }}>상호</td><td style={{ fontWeight: '700', fontSize: '12pt' }}>{sale.customer}</td></tr>
                    {customerCo?.businessNo && <tr><td style={{ color: '#888', paddingBottom: '3px' }}>사업자번호</td><td>{customerCo.businessNo}</td></tr>}
                    {customerCo?.ceo && <tr><td style={{ color: '#888', paddingBottom: '3px' }}>대표자</td><td>{customerCo.ceo}</td></tr>}
                    {customerCo?.address && <tr><td style={{ color: '#888', paddingBottom: '3px', verticalAlign: 'top' }}>주소</td><td style={{ fontSize: '7.5pt' }}>{customerCo.address}</td></tr>}
                    {customerCo?.phone && <tr><td style={{ color: '#888', paddingBottom: '3px' }}>전화</td><td>{customerCo.phone}</td></tr>}
                    {sale.salesperson && <tr><td style={{ color: '#888', paddingBottom: '3px' }}>담당자</td><td>{sale.salesperson}</td></tr>}
                  </tbody></table>
                </div>
              </div>
            </div>

            {/* 품목 테이블 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '8.5pt' }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'center', width: '32px' }}>No</th>
                <th style={{ ...th, textAlign: 'left' }}>품목 및 규격</th>
                <th style={{ ...th, textAlign: 'right', width: '50px' }}>수량</th>
                <th style={{ ...th, textAlign: 'right', width: '90px' }}>단가</th>
                <th style={{ ...th, textAlign: 'right', width: '95px' }}>공급가액</th>
                <th style={{ ...th, textAlign: 'left', width: '90px' }}>비고</th>
              </tr></thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ ...td, textAlign: 'center', color: '#888' }}>{i + 1}</td>
                    <td style={td}>
                      <div style={{ fontWeight: '600' }}>{item.product}</div>
                      {item.specification && <div style={{ fontSize: '7.5pt', color: '#666', marginTop: '1px' }}>{item.specification}</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{item.qty.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{item.unitPrice.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: '600' }}>{item.amount.toLocaleString()}</td>
                    <td style={{ ...td, color: '#555', fontSize: '7.5pt' }}>{(item as any).remark || ''}</td>
                  </tr>
                ))}
                {Array.from({ length: emptyRows }).map((_, i) => (
                  <tr key={`e${i}`}>
                    <td style={{ ...td, height: '24px', color: '#bbb', textAlign: 'center' }}>{items.length + i + 1}</td>
                    {[...Array(5)].map((_, j) => <td key={j} style={{ ...td, height: '24px' }}></td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ backgroundColor: '#f5f5f5', borderTop: '2px solid #ccc' }}>
                <td colSpan={4} style={{ ...td, textAlign: 'right', fontWeight: '700' }}>합 계</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: '700' }}>{netAmount.toLocaleString()}</td>
                <td style={td}></td>
              </tr></tfoot>
            </table>

            {/* 합계 박스 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', minWidth: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '9pt' }}>
                  <span style={{ color: '#666' }}>공급가액</span>
                  <strong>{netAmount.toLocaleString()}원</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '9pt' }}>
                  <span style={{ color: '#666' }}>부가세 (10%)</span>
                  <strong>{vat.toLocaleString()}원</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #ddd', paddingTop: '12px', fontSize: '18px', fontWeight: 800 }}>
                  <span>합계금액</span>
                  <span>{total.toLocaleString()}원</span>
                </div>
              </div>
            </div>

            {/* 기타사항 */}
            {sale.misc && (
              <div style={{ border: '1px solid #eee', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px' }}>
                <div style={{ fontWeight: '600', color: '#888', marginBottom: '4px', fontSize: '7.5pt' }}>기타 사항</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '8.5pt' }}>{sale.misc}</div>
              </div>
            )}

            {/* 입금계좌 + 도장 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '20px' }}>
              {company.bank ? (
                <div style={{ border: '1px solid #eee', borderRadius: '6px', padding: '10px 14px', fontSize: '8pt', flex: 1, marginRight: '20px' }}>
                  <div style={{ fontWeight: '600', color: '#888', marginBottom: '6px', fontSize: '7.5pt' }}>입금 계좌</div>
                  <div style={{ whiteSpace: 'pre-line' }}>{company.bank}</div>
                </div>
              ) : <div style={{ flex: 1 }} />}
              <div style={{ textAlign: 'center', position: 'relative', minWidth: '160px' }}>
                <div style={{ fontSize: '8pt', color: '#888', marginBottom: '8px' }}>{company.name} (인)</div>
                {company.stampUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={company.stampUrl} alt="stamp" style={{ width: '100px', opacity: 0.8, transform: 'rotate(-5deg)', display: 'block', margin: '0 auto' }} />
                  : <div style={{ width: '100px', height: '100px', border: '2px dashed #ccc', borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7.5pt', color: '#aaa' }}>도장</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */

export default function CRMPage() {
  const searchParams = useSearchParams();
  const curYear = new Date().getFullYear();
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStartDate, setFilterStartDate] = useState(`${curYear}-01-01`);
  const [filterEndDate, setFilterEndDate] = useState(`${curYear}-12-31`);
  const [modal, setModal] = useState<{ open: boolean; sale?: SalesRecord | null }>({ open: false });
  const [printModal, setPrintModal] = useState<{ open: boolean; sale?: SalesRecord | null }>({ open: false });
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [adminModal, setAdminModal] = useState<{ open: boolean; action: () => void }>({ open: false, action: () => {} });

  const safeFetch = async (url: string, fallback: object) => {
    try {
      const r = await fetch(url);
      if (r.redirected || r.url.includes('/login')) { window.location.href = '/login'; return fallback; }
      if (!r.ok) return fallback;
      return await r.json();
    } catch { return fallback; }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, cRes, pRes, csRes, poRes] = await Promise.all([
        safeFetch('/api/sales', { data: [] }),
        safeFetch('/api/companies', { data: [] }),
        safeFetch('/api/products', { data: [] }),
        safeFetch('/api/settings/company', { data: null }),
        safeFetch('/api/purchase-orders', { data: [] }),
      ]);
      setSales(Array.isArray(sRes.data) ? sRes.data : []);
      setCompanies((Array.isArray(cRes.data) ? cRes.data : []).map((c: any) => ({
        id: c.id, businessId: c.businessId, name: c.name, type: c.type, country: c.country || '',
        ceo: c.ceo || undefined, businessNo: c.businessNo || undefined,
        address: c.address || undefined, phone: c.phone || undefined, email: c.email || undefined,
      })));
      setProducts(Array.isArray(pRes.data) ? pRes.data : []);
      if (csRes.data) setCompany(csRes.data);
      setPurchaseOrders(Array.isArray(poRes.data) ? poRes.data : []);
    } catch (e) { console.error('[CRM] load error:', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || loading) return;
    const found = sales.find(s => s.businessId === openId);
    if (found) setModal({ open: true, sale: found });
  }, [loading, sales, searchParams]);

  const guardEdit = (sale: SalesRecord, action: () => void) => {
    if (isPrevMonth(sale.saleDate)) setAdminModal({ open: true, action });
    else action();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/sales/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = sales.filter(s => {
    const dateOk = (!filterStartDate || s.saleDate >= filterStartDate) && (!filterEndDate || s.saleDate <= filterEndDate);
    const q = search.toLowerCase();
    const searchOk = !q || s.customer.toLowerCase().includes(q) || s.businessId.toLowerCase().includes(q) || (s.salesperson ?? '').toLowerCase().includes(q);
    return dateOk && searchOk;
  });

  const totalNet = filtered.reduce((s, r) => s + r.netAmount, 0);
  const totalVat = filtered.reduce((s, r) => s + r.vat, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="매출 관리" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="거래처, 코드, 담당자 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="h-9 w-36 text-xs" />
              <span className="text-muted-foreground text-xs">~</span>
              <Input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="h-9 w-36 text-xs" />
              <Button variant="outline" size="sm" className="h-9 text-xs px-2" onClick={() => { setFilterStartDate(`${curYear}-01-01`); setFilterEndDate(`${curYear}-12-31`); }}>올해</Button>
              <Button variant="ghost" size="sm" className="h-9 text-xs px-2 text-muted-foreground" onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}>전체</Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5">
              <span>공급가: <strong className="text-foreground">{totalNet.toLocaleString()}원</strong></span>
              <span>부가세: <strong className="text-foreground">{totalVat.toLocaleString()}원</strong></span>
              <span>합계: <strong className="text-foreground">{(totalNet + totalVat).toLocaleString()}원</strong></span>
            </div>
            <Button size="sm" className="h-9 gap-1 shrink-0" onClick={() => setModal({ open: true, sale: null })}>
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">매출 등록</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">거래명세표번호</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">일자</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">거래처</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">유형</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground hidden lg:table-cell">담당자</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">공급가액</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground hidden lg:table-cell">부가세</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">합계</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">매출 데이터가 없습니다.</td></tr>
                ) : filtered.map(s => {
                  const prev = isPrevMonth(s.saleDate);
                  return (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          {prev && <Lock className="w-3 h-3 text-orange-400 shrink-0" />}
                          {s.businessId}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">{s.saleDate}</td>
                      <td className="px-3 py-3 font-medium">{s.customer}</td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">{s.saleType}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">{s.salesperson || '-'}</td>
                      <td className="px-3 py-3 text-right font-medium whitespace-nowrap">{s.netAmount.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground hidden lg:table-cell whitespace-nowrap">{s.vat.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-bold whitespace-nowrap">{s.totalAmount.toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => setPrintModal({ open: true, sale: s })}>
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => guardEdit(s, () => setModal({ open: true, sale: s }))}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => guardEdit(s, () => handleDelete(s.id))}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal.open && (
        <SaleModal sale={modal.sale} companies={companies} products={products}
          purchaseOrders={purchaseOrders} sales={sales}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }} />
      )}
      {printModal.open && printModal.sale && company && (
        <SalePrintModal sale={printModal.sale} company={company} companies={companies}
          onClose={() => setPrintModal({ open: false })} />
      )}
      {adminModal.open && (
        <AdminPasswordModal
          onConfirm={() => { setAdminModal({ open: false, action: () => {} }); adminModal.action(); }}
          onCancel={() => setAdminModal({ open: false, action: () => {} })} />
      )}
    </div>
  );
}
