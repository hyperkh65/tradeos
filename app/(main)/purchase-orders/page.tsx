'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Boxes, X, Loader2, Pencil, Trash2, Printer, Upload, TrendingDown, TrendingUp, History, Maximize2, Lock } from 'lucide-react';
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

const ADMIN_PASSWORD = '1209';
function isPrevMonth(d?: string) { if (!d) return false; const t = new Date(d), n = new Date(); return t.getFullYear() < n.getFullYear() || (t.getFullYear() === n.getFullYear() && t.getMonth() < n.getMonth()); }
function AdminPasswordModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(false);
  const check = () => { if (pw === ADMIN_PASSWORD) onConfirm(); else setErr(true); };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-xl shadow-2xl p-6 w-80">
        <div className="flex items-center gap-2 mb-3"><Lock className="w-5 h-5 text-orange-500" /><h3 className="font-semibold">전월 발주 수정</h3></div>
        <p className="text-sm text-muted-foreground mb-4">전월 발주는 관리자만 수정할 수 있습니다.<br />관리자 비밀번호를 입력하세요.</p>
        <Input type="password" placeholder="비밀번호" value={pw} onChange={e => { setPw(e.target.value); setErr(false); }} onKeyDown={e => e.key === 'Enter' && check()} className={err ? 'border-red-400' : ''} autoFocus />
        {err && <p className="text-xs text-red-500 mt-1">비밀번호가 올바르지 않습니다.</p>}
        <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={onCancel}>취소</Button><Button className="flex-1" onClick={check}>확인</Button></div>
      </div>
    </div>
  );
}

const CURRENCY_CODES_RE = /\s*\|\s*(USD|EUR|KRW|CNY|RMB|JPY|GBP|HKD)\s*$/i;
const cleanSpec = (s: string) => s.replace(CURRENCY_CODES_RE, '').replace(/^\s*(USD|EUR|KRW|CNY|RMB|JPY|GBP|HKD)\s*$/i, '').trim();
const fmtNum = (n: number, currency: string) =>
  currency === 'KRW'
    ? n.toLocaleString('ko-KR')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

function POPrintModal({ po, company, supplierCompany, onClose }: {
  po: PurchaseOrder & { imagesJson?: string; depositRatio?: string };
  company: CompanySettings;
  supplierCompany?: any;
  onClose: () => void;
}) {
  const items = (po.items || []) as any[];
  const totalAmount = Number(po.totalAmount) || items.reduce((s: number, i: any) => s + (i.amount || i.unitPrice * (i.qty || i.quantity || 0) || 0), 0);
  const depositRatio = Number((po as any).depositRatio || 30);
  const depositAmount = Number(po.depositAmount) || Math.round(totalAmount * depositRatio / 100 * 100) / 100;
  const balanceAmount = Number(po.balanceAmount) || totalAmount - depositAmount;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  let attachImages: string[] = [];
  try { attachImages = JSON.parse((po as any).imagesJson || '[]'); } catch { attachImages = []; }
  const emptyRows = Math.max(0, 8 - items.length);

  const handlePrint = () => {
    const orig = document.title;
    document.title = po.businessId;
    window.print();
    window.addEventListener('afterprint', () => { document.title = orig; }, { once: true });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&display=swap');
        #po-print-area .po-table { width: 100%; border-collapse: collapse; margin-top: 30px; }
        #po-print-area .po-table th { text-align: center; border-top: 2px solid #171717; border-bottom: 1px solid #171717; padding: 10px 4px; font-size: 11px; font-weight: 700; color: #171717; background: #f9f9f9; text-transform: uppercase; }
        #po-print-area .po-table td { border-bottom: 1px solid #e5e5e5; padding: 10px 4px; font-size: 11px; color: #333; vertical-align: middle; }
        #po-print-area .po-table tbody tr:last-child td { border-bottom: 1px solid #171717; }
        #po-print-area .box-container { display: flex; gap: 30px; margin-bottom: 30px; }
        #po-print-area .box { flex: 1; border: 1px solid #e5e5e5; padding: 20px; border-radius: 8px; position: relative; }
        #po-print-area .box-gray { flex: 1; background: #fafafa; border: none; padding: 20px; border-radius: 8px; position: relative; }
        #po-print-area .box-title { position: absolute; top: -10px; left: 15px; background: white; padding: 0 10px; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        #po-print-area .box-title-gray { position: absolute; top: -10px; left: 15px; background: #fafafa; padding: 0 10px; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        #po-print-area .box-content { font-size: 13px; line-height: 1.6; color: #333; }
        @media print {
          body * { visibility: hidden !important; }
          #po-print-area, #po-print-area * { visibility: visible !important; }
          #po-print-area {
            position: static !important;
            width: 210mm !important;
            min-height: 297mm !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 10mm !important;
            background: white !important;
            box-sizing: border-box !important;
          }
          .fixed { position: static !important; top: auto !important; right: auto !important; bottom: auto !important; left: auto !important; }
          .overflow-y-auto, .overflow-hidden { overflow: visible !important; height: auto !important; }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[900px]">
          <div className="no-print flex items-center justify-between p-4 border-b">
            <span className="font-semibold text-sm text-gray-800">발주서 미리보기</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> 인쇄 / PDF 저장</Button>
              <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>
          </div>

          <div id="po-print-area" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: 'white', color: '#171717', fontFamily: '"Noto Sans KR", Arial, sans-serif', boxSizing: 'border-box', padding: '10mm', position: 'relative' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '50px' }}>
              <div style={{ width: '30%' }}>
                {company.logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={company.logoUrl} alt="Logo" style={{ height: '45px', objectFit: 'contain', display: 'block' }} />
                  : <div style={{ fontSize: '16px', fontWeight: 800, color: '#171717' }}>{company.name}</div>}
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <h1 style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '4px', margin: '0 0 5px 0', color: '#171717' }}>PURCHASE ORDER</h1>
                <div style={{ width: '40px', height: '4px', background: '#171717', margin: '15px auto 0' }} />
              </div>
              <div style={{ width: '30%', textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>P.O Number</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#171717', marginBottom: '10px' }}>{po.businessId}</div>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>Issue Date</div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#333' }}>{po.orderDate || today}</div>
                {po.etd && <>
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px', marginTop: '8px', textTransform: 'uppercase' }}>ETD</div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#333' }}>{po.etd}</div>
                </>}
              </div>
            </div>

            {/* ── Supplier / Ship To ── */}
            <div className="box-container">
              <div className="box">
                <div className="box-title">Supplier (Vendor)</div>
                <div className="box-content">
                  <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '10px', color: '#171717' }}>{po.supplierName}</div>
                  {supplierCompany?.ceo && <div style={{ marginBottom: '2px' }}>Attn: {supplierCompany.ceo}</div>}
                  {supplierCompany?.address && <div style={{ marginBottom: '2px' }}>{supplierCompany.address}</div>}
                  {supplierCompany?.phone && <div style={{ marginBottom: '2px' }}>Tel: {supplierCompany.phone}</div>}
                  {supplierCompany?.email && <div style={{ marginBottom: '2px' }}>Email: {supplierCompany.email}</div>}
                  {supplierCompany?.wechat && <div>WeChat: {supplierCompany.wechat}</div>}
                </div>
              </div>
              <div className="box-gray">
                <div className="box-title-gray">Ship To (Buyer)</div>
                <div className="box-content">
                  <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '10px', color: '#171717' }}>{company.name}</div>
                  {company.address && <div style={{ marginBottom: '2px' }}>{company.address}</div>}
                  {(company.tel || company.fax) && <div style={{ marginBottom: '2px' }}>Tel: {company.tel}{company.fax ? ` / Fax: ${company.fax}` : ''}</div>}
                  {company.email && <div style={{ marginBottom: '2px' }}>Email: {company.email}</div>}
                  <div>Attn: Purchase Department</div>
                </div>
              </div>
            </div>

            {/* ── Table ── */}
            <table className="po-table">
              <thead>
                <tr>
                  <th style={{ width: '5%' }}>No</th>
                  <th style={{ textAlign: 'left', paddingLeft: '10px' }}>Description / Specifications</th>
                  <th style={{ width: '14%' }}>Tech Data</th>
                  <th style={{ width: '7%' }}>Unit</th>
                  <th style={{ width: '8%' }}>Qty</th>
                  <th style={{ width: '12%', textAlign: 'right', paddingRight: '8px' }}>Unit Price ({po.currency})</th>
                  <th style={{ width: '14%', textAlign: 'right', paddingRight: '8px' }}>Amount ({po.currency})</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, i: number) => {
                  const tech = [it.voltage, it.watts, it.cct, it.luminousEff, it.lumenOutput].filter(Boolean).join(' / ');
                  const spec = it.specification ? cleanSpec(it.specification) : '';
                  const rowAmt = it.amount || (it.unitPrice * (it.qty || it.quantity || 0)) || 0;
                  return (
                    <tr key={i}>
                      <td style={{ textAlign: 'center', color: '#888' }}>{i + 1}</td>
                      <td style={{ paddingLeft: '10px' }}>
                        <div style={{ fontWeight: 600, color: '#171717' }}>{it.productName}</div>
                        {spec && <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{spec}</div>}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '10px', color: '#666' }}>{tech || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{it.unit || 'PCS'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{(it.qty || it.quantity || 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', paddingRight: '8px' }}>{fmtNum(it.unitPrice || 0, po.currency)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#171717', paddingRight: '8px' }}>{fmtNum(rowAmt, po.currency)}</td>
                    </tr>
                  );
                })}
                {Array.from({ length: emptyRows }).map((_, i) => (
                  <tr key={`e${i}`}><td style={{ padding: '14px' }} /><td /><td /><td /><td /><td /><td /></tr>
                ))}
              </tbody>
            </table>

            {/* ── Totals ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', gap: '40px', alignItems: 'flex-start' }}>
              {depositAmount > 0 && (
                <div style={{ textAlign: 'right', fontSize: '12px', color: '#555', lineHeight: '2' }}>
                  <div>Sub Total: <strong>{po.currency} {fmtNum(totalAmount, po.currency)}</strong></div>
                  <div style={{ color: '#c05000' }}>Deposit {depositRatio}% (선금): <strong>{po.currency} {fmtNum(depositAmount, po.currency)}</strong></div>
                  <div style={{ color: '#1a50a0' }}>Balance {100 - depositRatio}% (잔금): <strong>{po.currency} {fmtNum(balanceAmount, po.currency)}</strong></div>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#666' }}>GRAND TOTAL ({po.currency})</div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#171717' }}>{fmtNum(totalAmount, po.currency)}</div>
              </div>
            </div>

            {/* ── Terms + Signature ── */}
            <div style={{ display: 'flex', gap: '30px', marginTop: '40px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#171717', marginBottom: '8px', textTransform: 'uppercase' }}>Terms & Conditions</div>
                <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.7', borderTop: '1px solid #e5e5e5', paddingTop: '10px', whiteSpace: 'pre-wrap' }}>
                  {po.paymentTerms && `Payment: ${po.paymentTerms}\n`}
                  {po.incoterm && `Incoterm: ${po.incoterm}\n`}
                  {po.orderDate && `Order Date: ${po.orderDate}\n`}
                  {po.etd && `ETD: ${po.etd}\n`}
                  {po.remark || ''}
                </div>
                {(company.bankForeign1 || company.bank) && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#171717', marginBottom: '8px', textTransform: 'uppercase' }}>Remittance Information</div>
                    <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.7', borderTop: '1px solid #e5e5e5', paddingTop: '10px', whiteSpace: 'pre-line', fontFamily: 'monospace' }}>
                      {company.bankForeign1 || company.bank}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ width: '260px', display: 'flex', flexDirection: 'column', minHeight: '160px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#171717', marginBottom: '10px', textTransform: 'uppercase' }}>Authorized Signature</div>
                <div style={{ flex: 1, borderBottom: '2px solid #171717', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '120px' }}>
                  {company.stampUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={company.stampUrl} alt="Stamp" style={{ width: '220px', opacity: 0.85, transform: 'rotate(-5deg)', position: 'absolute' }} />
                    : <div style={{ width: '140px', height: '140px', border: '1px dashed #ccc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: '11px' }}>직인</div>}
                </div>
                <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, marginTop: '8px', color: '#171717' }}>{company.name}</div>
              </div>
            </div>

            {attachImages.length > 0 && (
              <div style={{ pageBreakBefore: 'always', marginTop: '50px', padding: '10px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '20px', borderBottom: '2px solid #171717', paddingBottom: '10px' }}>ATTACHMENTS</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  {attachImages.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt={`attachment-${i + 1}`} style={{ maxWidth: '100%', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
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
  const [printModal, setPrintModal] = useState<{ open: boolean; item?: PurchaseOrder | null; supplierCompany?: any }>({ open: false });
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [adminModal, setAdminModal] = useState<{ open: boolean; action: () => void }>({ open: false, action: () => {} });

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

  const guardEdit = (po: any, action: () => void) => {
    if (isPrevMonth(po.orderDate || po.createdAt)) setAdminModal({ open: true, action });
    else action();
  };

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
    setPrintModal({ open: true, item: po, supplierCompany: companies.find((c: any) => c.name === po.supplierName) });
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
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => guardEdit(po, () => setModal({ open: true, item: po }))}>{isPrevMonth(po.orderDate || po.createdAt) && <Lock className="w-3 h-3 text-orange-400 mr-0.5" />}<Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => guardEdit(po, () => handleDelete(po.id))}><Trash2 className="w-3.5 h-3.5" /></Button>
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
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => guardEdit(po, () => setModal({ open: true, item: po }))}>{isPrevMonth(po.orderDate || po.createdAt) && <Lock className="w-3 h-3 text-orange-400 mr-0.5" />}<Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => guardEdit(po, () => handleDelete(po.id))}><Trash2 className="w-3.5 h-3.5" /></Button>
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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => guardEdit(po, () => setModal({ open: true, item: po }))}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => guardEdit(po, () => handleDelete(po.id))}><Trash2 className="w-3.5 h-3.5" /></Button>
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
        <POPrintModal po={printModal.item as any} company={company} supplierCompany={printModal.supplierCompany} onClose={() => setPrintModal({ open: false })} />
      )}
      {adminModal.open && (
        <AdminPasswordModal
          onConfirm={() => { setAdminModal({ open: false, action: () => {} }); adminModal.action(); }}
          onCancel={() => setAdminModal({ open: false, action: () => {} })}
        />
      )}
    </div>
  );
}
