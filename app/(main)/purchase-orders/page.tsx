'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Boxes, X, Loader2, Pencil, Trash2, Printer, Upload, TrendingDown, TrendingUp, History, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PurchaseOrder } from '@/types';

const statusLabel: Record<string, string> = { draft: '초안', confirmed: '확정', production: '생산', inspection: '검품', shipped: '선적', completed: '완료', cancelled: '취소' };
const statusColor: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', confirmed: 'bg-blue-100 text-blue-700', production: 'bg-yellow-100 text-yellow-700', inspection: 'bg-purple-100 text-purple-700', shipped: 'bg-cyan-100 text-cyan-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-600' };

const emptyItem = () => ({
  id: Date.now().toString(),
  productName: '', specification: '',
  voltage: '', watts: '', cct: '',
  luminousEff: '', lumenOutput: '',
  unit: 'PCS', qty: 1, unitPrice: 0, amount: 0, remarks: '',
});

const CURRENCY_CODES_RE = /\s*\|\s*(USD|EUR|KRW|CNY|RMB|JPY|GBP|HKD)\s*$/i;
const cleanSpec = (s: string) => s.replace(CURRENCY_CODES_RE, '').replace(/^\s*(USD|EUR|KRW|CNY|RMB|JPY|GBP|HKD)\s*$/i, '').trim();
const fmtNum = (n: number, currency: string) => currency === 'KRW' ? n.toLocaleString() : n.toFixed(2);

interface CompanySettings {
  name: string; ceo: string; bizNo: string; bizType: string; bizItem: string;
  address: string; tel: string; fax: string; email: string;
  bank: string; bankForeign1: string; bankForeign2: string;
  logoUrl: string; stampUrl: string;
}

interface PriceHint {
  code: string; nameKo: string;
  purchasePrice?: number; currency: string;
  recentPOPrice?: number; recentPOCompany?: string;
  voltage?: string; watts?: string; cct?: string;
  specification?: string;
  luminousEff?: string; lumenOutput?: string;
}

/* ─── 규격 확장 입력 모달 ─────────────────────────────────────────────────────── */

function SpecModal({ value, onSave, onClose }: { value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">규격 입력</h3>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <textarea
          autoFocus
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          rows={6}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="규격을 입력하세요..."
        />
        <div className="flex gap-2 mt-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button type="button" className="flex-1" onClick={() => { onSave(text); onClose(); }}>확인</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── 품목명 자동완성 입력 (hover 이력 포함) ─────────────────────────────────── */

function POProductInput({
  value, onChange, onSelect, products, pos, quotes,
}: {
  value: string; onChange: (v: string) => void; onSelect: (h: PriceHint) => void;
  products: any[]; pos: any[]; quotes: any[];
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const [histStyle, setHistStyle] = useState<React.CSSProperties>({});

  const matches = value.length >= 1 ? products.filter(p =>
    p.nameKo?.includes(value) || p.code?.includes(value) || (p.nameEn ?? '').includes(value)
  ).slice(0, 12) : [];

  const hints: PriceHint[] = matches.map(p => {
    const recentPOs = pos
      .flatMap((po: any) => (po.items || []).filter((it: any) =>
        it.productName === p.nameKo || it.productName === p.code ||
        (p.code && it.productName?.includes(p.code))
      ).map((it: any) => ({ price: it.unitPrice, company: po.supplierName, date: po.orderDate || po.createdAt })))
      .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
    const ex = p as any;
    return {
      code: p.code,
      nameKo: p.nameKo,
      purchasePrice: p.purchasePrice,
      currency: p.currency || 'USD',
      recentPOPrice: recentPOs[0]?.price,
      recentPOCompany: recentPOs[0]?.company,
      voltage: ex.voltage, watts: ex.watts, cct: ex.cct,
      luminousEff: ex.luminousEff, lumenOutput: ex.lumenOutput,
      specification: [ex.voltage, ex.watts, ex.cct].filter(Boolean).join(' / ') || ex.detail || '',
    };
  });

  // 이력 데이터
  const isMatch = (name: string) => name === value || (value.length > 4 && name.includes(value));
  const poHistory = pos
    .flatMap((po: any) => (po.items || []).filter((it: any) => isMatch(it.productName || ''))
      .map((it: any) => ({ date: po.orderDate || po.createdAt?.slice(0, 10) || '', supplier: po.supplierName || '', price: it.unitPrice || 0, qty: it.qty || it.quantity || 0, currency: po.currency || 'USD' })))
    .filter(h => h.price > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const allQtHistory = quotes
    .flatMap((q: any) => (q.items || []).filter((it: any) => isMatch(it.productName || ''))
      .map((it: any) => ({ date: (q as any).quoteDate || q.createdAt?.slice(0, 10) || '', company: q.companyName || '', price: it.unitPrice || 0, qty: it.quantity || it.qty || 0, currency: q.currency || 'USD', status: q.status || '' })))
    .filter(h => h.price > 0).sort((a, b) => b.date.localeCompare(a.date));

  // 견적이력: draft/sent 상태 (아직 확정 안 된 견적)
  const quoteHistory = allQtHistory.filter(h => ['draft', 'sent', ''].includes(h.status)).slice(0, 5);
  // 판매이력: confirmed/completed (확정된 매출)
  const saleHistory = allQtHistory.filter(h => ['confirmed', 'completed'].includes(h.status)).slice(0, 5);
  const hasHistory = poHistory.length > 0 || allQtHistory.length > 0;

  const openDrop = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropStyle({ position: 'fixed', top: rect.bottom + 2, left: Math.min(rect.left, window.innerWidth - 420), width: 410, zIndex: 9999 });
    }
    setShowSearch(true);
  };

  const openHist = () => {
    if (!hasHistory || isFocused) return;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const top = rect.bottom + 4;
      const left = Math.min(rect.left, window.innerWidth - 300);
      setHistStyle({ position: 'fixed', top, left, zIndex: 9998 });
    }
    setShowHist(true);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowSearch(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative w-full"
      onMouseEnter={openHist}
      onMouseLeave={() => setShowHist(false)}>
      <input
        ref={inputRef}
        className="w-full bg-transparent border-none outline-none text-xs"
        value={value}
        onChange={e => { onChange(e.target.value); if (e.target.value.length >= 1) openDrop(); else setShowSearch(false); }}
        onFocus={() => { setIsFocused(true); setShowHist(false); if (value.length >= 1) openDrop(); }}
        onBlur={() => { setIsFocused(false); }}
        placeholder="품목명 검색..."
      />
      {/* hover 이력 팝업 */}
      {showHist && hasHistory && (
        <div style={histStyle} className="w-80 bg-background border border-border rounded-xl shadow-2xl text-xs overflow-hidden">
          {/* 발주 이력 */}
          {poHistory.length > 0 && (
            <div>
              <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center gap-1.5">
                <TrendingDown className="w-3 h-3 text-blue-600" />
                <span className="font-bold text-blue-700 text-[10px] uppercase tracking-wide">발주 이력</span>
              </div>
              {poHistory.map((h, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 last:border-0 hover:bg-blue-50/50">
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">{h.date}</p>
                    <p className="font-semibold text-xs truncate max-w-[150px] text-blue-900">{h.supplier}</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="font-bold text-blue-700 text-xs">{h.currency} {typeof h.price === 'number' ? h.price.toFixed(2) : h.price}</p>
                    <p className="text-[10px] text-muted-foreground">×{h.qty.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* 견적 이력 (draft/sent) */}
          {quoteHistory.length > 0 && (
            <div>
              <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-amber-600" />
                <span className="font-bold text-amber-700 text-[10px] uppercase tracking-wide">견적 이력</span>
              </div>
              {quoteHistory.map((h, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 last:border-0 hover:bg-amber-50/50">
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">{h.date}</p>
                    <p className="font-semibold text-xs truncate max-w-[150px] text-amber-900">{h.company}</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="font-bold text-amber-700 text-xs">{h.currency} {typeof h.price === 'number' ? h.price.toFixed(2) : h.price}</p>
                    <p className="text-[10px] text-muted-foreground">×{h.qty.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* 판매 이력 (confirmed/completed) */}
          {saleHistory.length > 0 && (
            <div>
              <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                <span className="font-bold text-emerald-700 text-[10px] uppercase tracking-wide">판매 이력</span>
              </div>
              {saleHistory.map((h, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 last:border-0 hover:bg-emerald-50/50">
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">{h.date}</p>
                    <p className="font-semibold text-xs truncate max-w-[150px] text-emerald-900">{h.company}</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="font-bold text-emerald-700 text-xs">{h.currency} {typeof h.price === 'number' ? h.price.toFixed(2) : h.price}</p>
                    <p className="text-[10px] text-muted-foreground">×{h.qty.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* 검색 자동완성 드롭다운 */}
      {showSearch && (
        <div style={dropStyle} className="bg-background border border-border rounded-xl shadow-2xl max-h-72 overflow-y-auto">
          <div className="px-3 py-1.5 border-b bg-muted/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            제품 검색 결과 ({hints.length})
          </div>
          {hints.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">등록된 제품 없음</div>
          ) : hints.map(h => (
            <button key={h.code} type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(h); setShowSearch(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/20 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold leading-tight">{h.nameKo}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{h.code}</p>
                  {h.specification && <p className="text-[10px] text-muted-foreground">{h.specification}</p>}
                </div>
                <div className="text-right shrink-0">
                  {h.purchasePrice && <p className="text-xs font-bold text-blue-600">{h.currency} {h.purchasePrice.toFixed(2)}</p>}
                  {h.recentPOPrice && <p className="text-[10px] text-orange-600">최근발주 {h.recentPOPrice.toFixed(2)}</p>}
                  {h.recentPOCompany && <p className="text-[9px] text-muted-foreground">{h.recentPOCompany}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 공급업체 검색 입력 ─────────────────────────────────────────────────────── */

function SupplierInput({
  value, onChange, onSelect, companies,
}: {
  value: string; onChange: (v: string) => void; onSelect: (c: any) => void; companies: any[];
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

  const filtered = companies.filter(c =>
    !value || c.name?.includes(value) || (c.nameEn ?? '').includes(value)
  ).slice(0, 10);

  const openDrop = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropStyle({ position: 'fixed', top: rect.bottom + 2, left: rect.left, width: rect.width, zIndex: 9999 });
    }
    setShow(true);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        ref={inputRef}
        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        value={value}
        onChange={e => { onChange(e.target.value); openDrop(); }}
        onFocus={openDrop}
        placeholder="공급업체 검색..."
        required
      />
      {show && filtered.length > 0 && (
        <div style={dropStyle} className="bg-background border border-border rounded-xl shadow-2xl max-h-52 overflow-y-auto">
          {filtered.map(c => (
            <button key={c.id} type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(c); setShow(false); }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 border-b border-border/30 last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {c.nameEn && <span className="text-muted-foreground text-xs">{c.nameEn}</span>}
                {c.country && <span className="text-muted-foreground text-xs">({c.country})</span>}
                {c.type && <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{c.type}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── PO Image Upload ────────────────────────────────────────────────────── */

function POImageUpload({ images, poId, onChange }: { images: string[]; poId: string; onChange: (v: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/purchase-orders/${poId}/upload`, { method: 'POST', body: fd });
      const j = await res.json();
      if (j.url) onChange([...images, j.url]);
      else alert(j.error || '업로드 실패');
    } finally { setUploading(false); }
  }, [images, poId, onChange]);

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">첨부 사진 (최대 10장)</p>
      <div className="flex flex-wrap gap-2">
        {images.map((url, i) => (
          <div key={i} className="relative group w-20 h-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border" />
            <button type="button"
              onClick={() => onChange(images.filter((_, j) => j !== i))}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              ×
            </button>
          </div>
        ))}
        {images.length < 10 && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary transition-colors text-muted-foreground hover:text-primary">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            <span className="text-[9px]">사진 추가</span>
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      </div>
    </div>
  );
}

/* ─── PO Modal ───────────────────────────────────────────────────────────── */

function POModal({
  item, companies, products, pos, quotes, onClose, onSave,
}: {
  item?: PurchaseOrder | null; companies: any[]; products: any[]; pos: any[]; quotes: any[];
  onClose: () => void; onSave: () => void;
}) {
  const initImages = (): string[] => {
    try { return JSON.parse((item as any)?.imagesJson || '[]'); } catch { return []; }
  };

  const [form, setForm] = useState({
    supplierName: item?.supplierName || '',
    supplierId: item?.supplierId || '',
    currency: item?.currency || 'USD',
    orderDate: item?.orderDate || new Date().toISOString().slice(0, 10),
    etd: item?.etd || '',
    paymentTerms: item?.paymentTerms || '30% T/T in advance, 70% before shipment',
    incoterm: item?.incoterm || 'FOB',
    status: (item?.status || 'draft') as string,
    depositRatio: ((item as any)?.depositRatio || '30') as string,
    remark: item?.remark || '',
    items: item?.items?.length ? item.items.map((i: any, idx: number) => ({
      id: String(idx),
      productName: i.productName || '',
      specification: i.specification || '',
      voltage: i.voltage || '',
      watts: i.watts || '',
      cct: i.cct || '',
      luminousEff: i.luminousEff || '',
      lumenOutput: i.lumenOutput || '',
      unit: i.unit || 'PCS',
      qty: i.qty || i.quantity || 1,
      unitPrice: i.unitPrice || 0,
      amount: i.amount || (i.qty || 1) * (i.unitPrice || 0),
      remarks: i.remarks || '',
    })) : [emptyItem()],
  });
  const [images, setImages] = useState<string[]>(initImages);
  const [savedId] = useState<string>((item as any)?.id || '');
  const [saving, setSaving] = useState(false);
  const [specModal, setSpecModal] = useState<{ open: boolean; idx: number; value: string }>({ open: false, idx: 0, value: '' });
  const [showQuoteSelect, setShowQuoteSelect] = useState(false);

  const updateItem = (idx: number, field: string, val: string | number) => {
    const items = [...form.items];
    (items[idx] as any)[field] = val;
    if (field === 'qty' || field === 'unitPrice') {
      items[idx].amount = items[idx].qty * items[idx].unitPrice;
    }
    setForm(f => ({ ...f, items }));
  };

  const applyRecentPOPrices = () => {
    const updated = form.items.map(it => {
      if (!it.productName) return it;
      const recent = pos
        .flatMap((po: any) => (po.items || [])
          .filter((pi: any) => pi.productName === it.productName && (pi.unitPrice || 0) > 0)
          .map((pi: any) => ({ price: pi.unitPrice, date: po.orderDate || po.createdAt || '' })))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (recent) return { ...it, unitPrice: recent.price, amount: it.qty * recent.price };
      return it;
    });
    setForm(f => ({ ...f, items: updated }));
  };

  const importFromQuote = (quoteId: string) => {
    const q = quotes.find((q: any) => q.id === quoteId);
    if (!q) return;
    const imported = (q.items || []).map((qi: any, i: number) => ({
      id: Date.now().toString() + i,
      productName: qi.productName || '',
      specification: qi.specification || '',
      voltage: qi.voltage || '',
      watts: qi.watts || '',
      cct: qi.cct || '',
      luminousEff: qi.luminousEff || '',
      lumenOutput: qi.lumenOutput || '',
      unit: qi.unit || 'PCS',
      qty: qi.quantity || qi.qty || 1,
      unitPrice: qi.unitPrice || 0,
      amount: (qi.quantity || qi.qty || 1) * (qi.unitPrice || 0),
      remarks: qi.remarks || '',
    }));
    setForm(f => ({ ...f, items: [...f.items.filter(i => i.productName !== ''), ...imported] }));
    setShowQuoteSelect(false);
  };

  const applyProductHint = (idx: number, h: PriceHint) => {
    const items = [...form.items];
    items[idx] = {
      ...items[idx],
      productName: h.nameKo || items[idx].productName,
      specification: h.specification || items[idx].specification,
      voltage: h.voltage || items[idx].voltage,
      watts: h.watts || items[idx].watts,
      cct: h.cct || items[idx].cct,
      luminousEff: h.luminousEff || items[idx].luminousEff,
      lumenOutput: h.lumenOutput || items[idx].lumenOutput,
      unitPrice: h.purchasePrice || h.recentPOPrice || items[idx].unitPrice,
    };
    items[idx].amount = items[idx].qty * items[idx].unitPrice;
    setForm(f => ({ ...f, items }));
  };

  const totalAmount = form.items.reduce((s, i) => s + i.amount, 0);
  const depositAmount = Math.round(totalAmount * Number(form.depositRatio) / 100);
  const balanceAmount = totalAmount - depositAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        items: form.items.map(i => ({ ...i })),
        totalAmount, depositAmount, balanceAmount,
        imagesJson: JSON.stringify(images),
      };
      if (item) {
        await fetch(`/api/purchase-orders/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  const uploadPoId = savedId || item?.id || `po-temp-${Date.now()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">{item ? '발주 수정' : '새 발주'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Row 1: Supplier + Currency + Incoterm */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">공급업체 *</label>
              <SupplierInput
                value={form.supplierName}
                onChange={v => setForm(f => ({ ...f, supplierName: v, supplierId: '' }))}
                onSelect={c => setForm(f => ({ ...f, supplierName: c.name, supplierId: c.id }))}
                companies={companies}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>USD</option><option>EUR</option><option>KRW</option><option>CNY</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">인코텀</label>
              <select value={form.incoterm} onChange={e => setForm(f => ({ ...f, incoterm: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>FOB</option><option>CIF</option><option>EXW</option><option>DAP</option>
              </select>
            </div>
          </div>

          {/* Row 2: Dates + Payment + Deposit + Status */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">발주일</label>
              <Input type="date" value={form.orderDate} onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">선적예정일 (ETD)</label>
              <Input type="date" value={form.etd} onChange={e => setForm(f => ({ ...f, etd: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">결제조건</label>
              <Input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="30% T/T" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">선금비율 (%)</label>
              <Input type="number" value={form.depositRatio} onChange={e => setForm(f => ({ ...f, depositRatio: e.target.value }))} placeholder="30" min="0" max="100" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Items table */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium w-[210px]">품목명</th>
                  <th className="px-2 py-2 text-left font-medium w-[110px]">규격</th>
                  <th className="px-2 py-2 text-left font-medium w-14">전압</th>
                  <th className="px-2 py-2 text-left font-medium w-14">와트</th>
                  <th className="px-2 py-2 text-left font-medium w-12">CCT</th>
                  <th className="px-2 py-2 text-left font-medium w-16">발광효율</th>
                  <th className="px-2 py-2 text-left font-medium w-16">광속</th>
                  <th className="px-2 py-2 text-left font-medium w-12">단위</th>
                  <th className="px-2 py-2 text-right font-medium w-12">수량</th>
                  <th className="px-2 py-2 text-right font-medium w-20">단가</th>
                  <th className="px-2 py-2 text-right font-medium w-24">금액</th>
                  <th className="px-2 py-2 text-left font-medium w-[90px]">비고</th>
                  <th className="px-2 py-2 w-7"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {form.items.map((it, idx) => (
                  <tr key={it.id} className="hover:bg-muted/20">
                    <td className="px-2 py-1">
                      <POProductInput
                        value={it.productName}
                        onChange={v => updateItem(idx, 'productName', v)}
                        onSelect={h => applyProductHint(idx, h)}
                        products={products}
                        pos={pos}
                        quotes={quotes}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-0.5">
                        <input className="flex-1 bg-transparent border-none outline-none text-xs min-w-0"
                          value={it.specification} onChange={e => updateItem(idx, 'specification', e.target.value)}
                          placeholder="규격" />
                        <button type="button" title="크게 입력"
                          className="shrink-0 text-muted-foreground hover:text-primary"
                          onClick={() => setSpecModal({ open: true, idx, value: it.specification })}>
                          <Maximize2 className="w-3 h-3" />
                        </button>
                        <button type="button" title="제품에서 규격 자동 가져오기"
                          className="shrink-0 text-[9px] text-muted-foreground hover:text-primary px-0.5"
                          onClick={() => {
                            const p = products.find((p: any) =>
                              p.nameKo === it.productName || p.code === it.productName ||
                              (p.code && it.productName?.includes(p.code))
                            ) as any;
                            if (p) updateItem(idx, 'specification', p.sizeSpec || p.detail || '');
                            else alert('제품 DB에서 매칭되는 제품을 찾을 수 없습니다.');
                          }}>↗</button>
                      </div>
                    </td>
                    <td className="px-1 py-1"><input className="w-full bg-transparent border-none outline-none text-xs text-center" value={it.voltage} onChange={e => updateItem(idx, 'voltage', e.target.value)} placeholder="220V" /></td>
                    <td className="px-1 py-1"><input className="w-full bg-transparent border-none outline-none text-xs text-center" value={it.watts} onChange={e => updateItem(idx, 'watts', e.target.value)} placeholder="40W" /></td>
                    <td className="px-1 py-1"><input className="w-full bg-transparent border-none outline-none text-xs text-center" value={it.cct} onChange={e => updateItem(idx, 'cct', e.target.value)} placeholder="4K" /></td>
                    <td className="px-1 py-1"><input className="w-full bg-transparent border-none outline-none text-xs text-center" value={it.luminousEff} onChange={e => updateItem(idx, 'luminousEff', e.target.value)} placeholder="100lm/W" /></td>
                    <td className="px-1 py-1"><input className="w-full bg-transparent border-none outline-none text-xs text-center" value={it.lumenOutput} onChange={e => updateItem(idx, 'lumenOutput', e.target.value)} placeholder="4000lm" /></td>
                    <td className="px-1 py-1">
                      <select className="w-full bg-transparent border-none outline-none text-xs text-center" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}>
                        <option>PCS</option><option>SET</option><option>BOX</option><option>KIT</option><option>M</option>
                      </select>
                    </td>
                    <td className="px-1 py-1"><input type="number" className="w-full bg-transparent border-none outline-none text-xs text-right" value={it.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} /></td>
                    <td className="px-1 py-1"><input type="number" step="0.01" className="w-full bg-transparent border-none outline-none text-xs text-right" value={it.unitPrice} onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))} /></td>
                    <td className="px-2 py-1 text-right font-medium">{it.amount.toLocaleString()}</td>
                    <td className="px-1 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={it.remarks} onChange={e => updateItem(idx, 'remarks', e.target.value)} /></td>
                    <td className="px-1 py-1"><button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-2 border-t flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> 품목 추가
                </button>
                <button type="button" onClick={() => setShowQuoteSelect(true)} className="text-xs text-amber-600 hover:underline flex items-center gap-1">
                  <History className="w-3 h-3" /> 견적서에서 가져오기
                </button>
                <button type="button" onClick={applyRecentPOPrices} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> 최근 발주가 적용
                </button>
              </div>
              <div className="text-xs space-x-4 text-right">
                <span className="text-muted-foreground">총액: <strong>{form.currency} {totalAmount.toLocaleString()}</strong></span>
                <span className="text-muted-foreground">선금({form.depositRatio}%): <strong className="text-orange-600">{depositAmount.toLocaleString()}</strong></span>
                <span className="text-muted-foreground">잔금: <strong className="text-blue-600">{balanceAmount.toLocaleString()}</strong></span>
              </div>
            </div>
          </div>

          {/* Remark */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">비고</label>
            <textarea rows={2} value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>

          <POImageUpload images={images} poId={uploadPoId} onChange={setImages} />

          {specModal.open && (
            <SpecModal
              value={specModal.value}
              onSave={v => updateItem(specModal.idx, 'specification', v)}
              onClose={() => setSpecModal({ open: false, idx: 0, value: '' })}
            />
          )}
          {showQuoteSelect && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40" onClick={() => setShowQuoteSelect(false)}>
              <div className="bg-background rounded-xl shadow-2xl w-full max-w-md max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-3 border-b flex items-center justify-between shrink-0">
                  <h3 className="font-semibold text-sm">견적서 선택</h3>
                  <button type="button" onClick={() => setShowQuoteSelect(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
                <div className="overflow-y-auto flex-1">
                  {quotes.length === 0 ? (
                    <p className="p-4 text-sm text-center text-muted-foreground">등록된 견적 없음</p>
                  ) : quotes.map((q: any) => (
                    <button key={q.id} type="button"
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 border-b border-border/30 last:border-0"
                      onClick={() => importFromQuote(q.id)}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">{q.businessId}</p>
                          <p className="text-xs text-muted-foreground">{q.companyName} · {q.quoteDate || q.createdAt?.slice(0, 10)}</p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-xs font-medium">{q.currency} {Number(q.totalAmount || 0).toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">{(q.items || []).length}개 품목</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
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

/* ─── PO Print Modal ─────────────────────────────────────────────────────── */

function POPrintModal({ po, company, onClose }: { po: PurchaseOrder & { imagesJson?: string; depositRatio?: string }; company: CompanySettings; onClose: () => void }) {
  const items = (po.items || []) as any[];
  const totalAmount = Number(po.totalAmount) || items.reduce((s: number, i: any) => s + (i.amount || i.unitPrice * (i.qty || i.quantity || 0) || 0), 0);
  const depositRatio = Number((po as any).depositRatio || 30);
  const depositAmount = Number(po.depositAmount) || Math.round(totalAmount * depositRatio / 100);
  const balanceAmount = Number(po.balanceAmount) || totalAmount - depositAmount;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  let attachImages: string[] = [];
  try { attachImages = JSON.parse((po as any).imagesJson || '[]'); } catch { attachImages = []; }

  const handlePrint = () => {
    const orig = document.title;
    document.title = po.businessId;
    window.print();
    window.addEventListener('afterprint', () => { document.title = orig; }, { once: true });
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #po-print-area, #po-print-area * { visibility: visible !important; }
          #po-print-area { position: fixed; left: 0; top: 0; width: 210mm; padding: 15mm !important; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
      <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[900px]">
          <div className="flex items-center justify-between p-4 border-b no-print">
            <span className="font-semibold text-sm text-gray-800">발주서 미리보기</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> 인쇄 / PDF 저장</Button>
              <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>
          </div>

          <div id="po-print-area" style={{ width: '210mm', minHeight: '297mm', padding: '15mm', background: 'white', fontFamily: 'Arial, sans-serif', color: '#111', fontSize: '9pt', lineHeight: '1.4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div style={{ flex: 1 }}>
                {company.logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={company.logoUrl} alt="logo" style={{ maxHeight: '50px', maxWidth: '160px', objectFit: 'contain' }} />
                  : <div style={{ fontSize: '13pt', fontWeight: 'bold', color: '#1a1a2e' }}>{company.name}</div>}
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '20pt', fontWeight: 'bold', letterSpacing: '3px', color: '#1a1a2e' }}>PURCHASE ORDER</div>
              </div>
              <div style={{ textAlign: 'right', flex: 1 }}>
                <div style={{ marginBottom: '4px' }}><span style={{ color: '#666', fontSize: '8pt' }}>PO No. </span><strong>{po.businessId}</strong></div>
                <div style={{ marginBottom: '2px' }}><span style={{ color: '#666', fontSize: '8pt' }}>Date: </span>{po.orderDate || today}</div>
                {po.etd && <div><span style={{ color: '#666', fontSize: '8pt' }}>ETD: </span>{po.etd}</div>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ border: '1px solid #ddd', borderRadius: '5px', padding: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '7.5pt', color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>Buyer</div>
                <div style={{ fontWeight: 'bold', fontSize: '10pt', marginBottom: '3px' }}>{company.name}</div>
                {company.ceo && <div style={{ marginBottom: '2px' }}>CEO: {company.ceo}</div>}
                {company.bizNo && <div style={{ marginBottom: '2px' }}>Reg. No: {company.bizNo}</div>}
                {company.address && <div style={{ marginBottom: '2px' }}>{company.address}</div>}
                {company.tel && <div style={{ marginBottom: '2px' }}>TEL: {company.tel}</div>}
                {company.fax && <div style={{ marginBottom: '2px' }}>FAX: {company.fax}</div>}
                {company.email && <div>Email: {company.email}</div>}
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: '5px', padding: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '7.5pt', color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>Supplier</div>
                <div style={{ fontWeight: 'bold', fontSize: '10pt' }}>{po.supplierName}</div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '8.5pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#1a1a2e', color: 'white' }}>
                  <th style={{ padding: '7px 6px', textAlign: 'center', width: '24px', borderRight: '1px solid #444' }}>No.</th>
                  <th style={{ padding: '7px 6px', textAlign: 'left', borderRight: '1px solid #444' }}>Description / Model</th>
                  <th style={{ padding: '7px 6px', textAlign: 'center', width: '110px', borderRight: '1px solid #444' }}>Tech Detail</th>
                  <th style={{ padding: '7px 6px', textAlign: 'center', width: '35px', borderRight: '1px solid #444' }}>Unit</th>
                  <th style={{ padding: '7px 6px', textAlign: 'right', width: '40px', borderRight: '1px solid #444' }}>Qty</th>
                  <th style={{ padding: '7px 6px', textAlign: 'right', width: '80px', borderRight: '1px solid #444' }}>Unit Price ({po.currency})</th>
                  <th style={{ padding: '7px 6px', textAlign: 'right', width: '80px' }}>Amount ({po.currency})</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, idx: number) => {
                  const techDetail = [
                    it.voltage && `${it.voltage}`,
                    it.watts && `${it.watts}`,
                    it.cct && `${it.cct}`,
                    it.luminousEff && `${it.luminousEff}`,
                    it.lumenOutput && `${it.lumenOutput}`,
                  ].filter(Boolean).join('\n');
                  const specDisplay = it.specification ? cleanSpec(it.specification) : '';
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '6px', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '6px' }}>
                        <div style={{ fontWeight: '600' }}>{it.productName}</div>
                        {specDisplay && <div style={{ color: '#555', fontSize: '7.5pt' }}>{specDisplay}</div>}
                        {it.remarks && <div style={{ color: '#777', fontSize: '7pt', fontStyle: 'italic' }}>{it.remarks}</div>}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center', color: '#444', fontSize: '7.5pt', whiteSpace: 'pre-line', lineHeight: '1.5' }}>{techDetail || '-'}</td>
                      <td style={{ padding: '6px', textAlign: 'center', color: '#444' }}>{it.unit || 'PCS'}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{(it.qty || it.quantity || 0).toLocaleString()}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{fmtNum(it.unitPrice || 0, po.currency)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: '600' }}>{fmtNum(it.amount || (it.unitPrice * (it.qty || it.quantity || 0)), po.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid #ccc', backgroundColor: '#f9f9f9' }}>
                  <td colSpan={6} style={{ padding: '6px', textAlign: 'right', color: '#555' }}>Sub Total</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{po.currency} {fmtNum(totalAmount, po.currency)}</td>
                </tr>
                {depositAmount > 0 && <>
                  <tr style={{ backgroundColor: '#fff8f0' }}>
                    <td colSpan={6} style={{ padding: '6px', textAlign: 'right', color: '#c05000' }}>Deposit {depositRatio}% (선금)</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: '#c05000', fontWeight: '600' }}>{po.currency} {fmtNum(depositAmount, po.currency)}</td>
                  </tr>
                  <tr style={{ backgroundColor: '#f0f8ff' }}>
                    <td colSpan={6} style={{ padding: '6px', textAlign: 'right', color: '#1a50a0' }}>Balance {100 - depositRatio}% (잔금)</td>
                    <td style={{ padding: '6px', textAlign: 'right', color: '#1a50a0', fontWeight: '600' }}>{po.currency} {fmtNum(balanceAmount, po.currency)}</td>
                  </tr>
                </>}
                <tr style={{ borderTop: '2px solid #1a1a2e', backgroundColor: '#f0f0f5' }}>
                  <td colSpan={6} style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', fontSize: '10pt' }}>GRAND TOTAL ({po.currency})</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', fontSize: '10pt' }}>{fmtNum(totalAmount, po.currency)}</td>
                </tr>
              </tfoot>
            </table>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ border: '1px solid #ddd', borderRadius: '5px', padding: '9px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '7.5pt', color: '#666', marginBottom: '5px', textTransform: 'uppercase' }}>Terms & Conditions</div>
                {po.paymentTerms && <div style={{ marginBottom: '3px' }}>Payment: {po.paymentTerms}</div>}
                {po.incoterm && <div style={{ marginBottom: '3px' }}>Incoterm: {po.incoterm}</div>}
                {po.orderDate && <div style={{ marginBottom: '3px' }}>Order Date: {po.orderDate}</div>}
                {po.etd && <div>ETD: {po.etd}</div>}
                {po.remark && <div style={{ marginTop: '4px', color: '#555', fontSize: '7.5pt' }}>{po.remark}</div>}
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: '5px', padding: '9px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '7.5pt', color: '#666', marginBottom: '5px', textTransform: 'uppercase' }}>Remittance Information</div>
                {company.bankForeign1
                  ? <div style={{ fontFamily: 'monospace', fontSize: '7.5pt', whiteSpace: 'pre-line' }}>{company.bankForeign1}</div>
                  : company.bank
                    ? <div style={{ fontSize: '7.5pt', whiteSpace: 'pre-line' }}>{company.bank}</div>
                    : null}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <div style={{ textAlign: 'center', minWidth: '160px' }}>
                <div style={{ fontSize: '8pt', color: '#666', marginBottom: '8px' }}>Authorized Signature</div>
                {company.stampUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={company.stampUrl} alt="stamp" style={{ height: '70px', objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} />
                  : <div style={{ height: '70px', border: '1px dashed #ccc', borderRadius: '4px', marginBottom: '8px' }} />}
                <div style={{ borderTop: '1px solid #333', paddingTop: '4px', fontSize: '9pt', fontWeight: 'bold' }}>{company.name}</div>
              </div>
            </div>

            {attachImages.length > 0 && (
              <div style={{ marginTop: '20px', pageBreakBefore: 'always' }}>
                <div style={{ fontWeight: 'bold', fontSize: '9pt', marginBottom: '12px', borderBottom: '1px solid #ddd', paddingBottom: '6px' }}>Attachments / 첨부사진</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {attachImages.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt={`attachment-${i + 1}`} style={{ width: '100%', height: '140px', objectFit: 'contain', border: '1px solid #eee', borderRadius: '4px' }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<(PurchaseOrder & { imagesJson?: string; depositRatio?: string })[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [modal, setModal] = useState<{ open: boolean; item?: PurchaseOrder | null }>({ open: false });
  const [printModal, setPrintModal] = useState<{ open: boolean; item?: PurchaseOrder | null }>({ open: false });
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const [posRes, companiesRes, productsRes, quotesRes] = await Promise.all([
      fetch('/api/purchase-orders').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
      fetch('/api/quotes').then(r => r.json()),
    ]);
    if (posRes.data) setPos(posRes.data);
    if (companiesRes.data) setCompanies(companiesRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (quotesRes.data) setQuotes(quotesRes.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('발주를 삭제하시겠습니까?')) return;
    await fetch(`/api/purchase-orders/${id}`, { method: 'DELETE' });
    load();
  };

  const handlePrint = async (po: PurchaseOrder) => {
    if (!company) {
      const res = await fetch('/api/settings/company').then(r => r.json());
      setCompany(res.data);
    }
    setPrintModal({ open: true, item: po });
  };

  const statuses = ['전체', ...Object.keys(statusLabel).filter(s => pos.some(p => p.status === s))];
  const filtered = pos.filter(p => {
    const ms = p.businessId.includes(search) || p.supplierName.includes(search) || p.items.some(i => i.productName.includes(search));
    const mf = statusFilter === '전체' || p.status === statusFilter;
    return ms && mf;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="발주" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="발주번호, 업체명 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 overflow-x-auto">
              {statuses.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn('shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors',
                    statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
                  {s === '전체' ? '전체' : statusLabel[s]}
                </button>
              ))}
            </div>
            <Button size="sm" className="h-9 gap-1 shrink-0 ml-auto" onClick={() => setModal({ open: true, item: null })}>
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">새 발주</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">발주번호</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">공급업체</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">제품</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">금액</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground hidden xl:table-cell">선금/잔금</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">ETD</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">상태</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(po => {
                    const revisions: any[] = (() => { try { return JSON.parse((po as any).revisionsJson || '[]'); } catch { return []; } })();
                    const depDisplay = (p: any) => {
                      const ratio = Number((p as any).depositRatio || 30);
                      const dep = p.depositAmount != null ? Number(p.depositAmount) : Math.round(p.totalAmount * ratio / 100);
                      const bal = p.balanceAmount != null ? Number(p.balanceAmount) : p.totalAmount - dep;
                      return dep > 0 ? <><span className="text-orange-600">{dep.toLocaleString()}</span> / {bal.toLocaleString()}</> : <span className="text-muted-foreground">-</span>;
                    };

                    // No revisions: single normal row
                    if (revisions.length === 0) return (
                      <tr key={po.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3 font-mono text-xs font-medium whitespace-nowrap">{po.businessId}</td>
                        <td className="px-3 py-3 text-sm font-medium"><span className="truncate block max-w-[140px]">{po.supplierName}</span></td>
                        <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell"><span className="truncate block max-w-[220px]">{po.items.map(i => `${i.productName}×${i.qty}`).join(', ')}</span></td>
                        <td className="px-3 py-3 text-sm font-semibold whitespace-nowrap">{po.currency} {Number(po.totalAmount).toLocaleString()}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap hidden xl:table-cell">{depDisplay(po)}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">{po.etd ?? '-'}</td>
                        <td className="px-3 py-3"><span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap', statusColor[po.status])}>{statusLabel[po.status]}</span></td>
                        <td className="px-3 py-3"><div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" title="발주서 출력" onClick={() => handlePrint(po)}><Printer className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: po })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(po.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div></td>
                      </tr>
                    );

                    // Has revisions:
                    // revisions[0].snapshot = ORIGINAL (before 1st edit)
                    // revisions[1..n].snapshot = intermediate states
                    // current PO = latest state
                    const original = revisions[0].snapshot;
                    const intermediates = revisions.slice(1); // states before 2nd, 3rd... edits

                    const subRow = (snap: any, key: string, isLatest: boolean) => (
                      <tr key={key} className={cn('border-l-2 border-blue-300', isLatest ? 'bg-blue-50/30 hover:bg-blue-50/50 dark:bg-blue-950/10' : 'bg-muted/20 opacity-70')}>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                          <span className="text-blue-500 font-bold mr-1">›</span>
                          <span className={isLatest ? 'font-medium' : 'text-muted-foreground'}>{po.businessId}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground"><span className="truncate block max-w-[140px]">{isLatest ? po.supplierName : (snap.supplierName || '-')}</span></td>
                        <td className="px-3 py-2 text-xs text-muted-foreground hidden lg:table-cell">
                          {isLatest ? <span className="truncate block max-w-[220px]">{po.items.map(i => `${i.productName}×${i.qty}`).join(', ')}</span> : <span>-</span>}
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold whitespace-nowrap">{(isLatest ? po.currency : snap.currency)} {Number(isLatest ? po.totalAmount : snap.totalAmount || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-xs hidden xl:table-cell">{isLatest ? depDisplay(po) : <span className="text-muted-foreground">-</span>}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">{(isLatest ? po.etd : snap.etd) ?? '-'}</td>
                        <td className="px-3 py-2"><span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', statusColor[isLatest ? po.status : snap.status] || 'bg-gray-100 text-gray-500')}>{statusLabel[isLatest ? po.status : snap.status] || (isLatest ? po.status : snap.status) || '-'}</span></td>
                        <td className="px-3 py-2">{isLatest && <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" title="발주서 출력" onClick={() => handlePrint(po)}><Printer className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: po })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(po.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>}</td>
                      </tr>
                    );

                    return (
                      <React.Fragment key={po.id}>
                        {/* Original (first created) — muted parent row, no actions */}
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{po.businessId}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground"><span className="truncate block max-w-[140px]">{original.supplierName || po.supplierName}</span></td>
                          <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">-</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{original.currency} {Number(original.totalAmount || 0).toLocaleString()}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground hidden xl:table-cell">-</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">{original.etd ?? '-'}</td>
                          <td className="px-3 py-3"><span className={cn('text-[10px] px-2 py-0.5 rounded-full', statusColor[original.status] || 'bg-gray-100 text-gray-500')}>{statusLabel[original.status] || original.status || '-'}</span></td>
                          <td className="px-3 py-3"></td>
                        </tr>
                        {/* Intermediate revisions (after 1st edit, before last edit) */}
                        {intermediates.map((rev: any, ri: number) => subRow(rev.snapshot, `${po.id}-mid-${ri}`, false))}
                        {/* Latest (current) state with action buttons */}
                        {subRow(null, `${po.id}-cur`, true)}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" />발주가 없습니다.</div>}
            </div>

            <div className="md:hidden space-y-2">
              {filtered.map(po => (
                <div key={po.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{po.businessId}</p>
                      <p className="font-semibold text-sm mt-0.5">{po.supplierName}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={cn('text-[11px] font-semibold px-2.5 py-0.5 rounded-full', statusColor[po.status])}>{statusLabel[po.status]}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => handlePrint(po)}><Printer className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: po })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(po.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-2">{po.items.map(i => i.productName).join(', ')}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">총액</p><p className="font-semibold">{po.currency} {Number(po.totalAmount).toLocaleString()}</p></div>
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">ETD</p><p className="font-semibold">{po.etd ?? '-'}</p></div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">발주가 없습니다.</div>}
            </div>
          </>
        )}
      </div>
      {modal.open && (
        <POModal
          item={modal.item}
          companies={companies}
          products={products}
          pos={pos}
          quotes={quotes}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }}
        />
      )}
      {printModal.open && printModal.item && company && (
        <POPrintModal po={printModal.item as any} company={company} onClose={() => setPrintModal({ open: false })} />
      )}
    </div>
  );
}
