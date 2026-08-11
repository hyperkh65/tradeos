'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ClipboardList, Plus, Search, X, Loader2, Pencil, Trash2, Printer,
  Copy, ChevronDown, Upload, History, Lock, AlertTriangle, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Quote } from '@/types';

const ADMIN_PASSWORD = '1209';
const statusStyle: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', expired: 'bg-orange-100 text-orange-700',
};
const statusLabel: Record<string, string> = { draft: '초안', sent: '발송', accepted: '수락', rejected: '거절', expired: '만료' };
const typeLabel: Record<string, string> = { customer: '판매견적', supplier: '구매견적' };
const typeStyle: Record<string, string> = { customer: 'bg-emerald-50 text-emerald-700', supplier: 'bg-violet-50 text-violet-700' };

interface CompanySettings {
  name: string; ceo: string; bizNo: string; bizType: string; bizItem: string;
  address: string; tel: string; fax: string; email: string;
  bank: string; bankForeign1: string; bankForeign2: string; logoUrl: string; stampUrl: string;
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function isPrevMonth(dateStr?: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() < now.getFullYear() ||
    (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth());
}

function emptyItem() {
  return { id: Date.now().toString() + Math.random(), productName: '', specification: '', voltage: '', watts: '', cct: '', quantity: 1, moq: 0, unitPrice: 0, amount: 0, remark: '' };
}

/* ─── Admin password modal ───────────────────────────────────────────────── */

function AdminPasswordModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-xl shadow-2xl p-6 w-80">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold">전월 견적서 수정</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">전월 견적서는 관리자만 수정할 수 있습니다.<br />관리자 비밀번호를 입력하세요.</p>
        <Input type="password" placeholder="비밀번호" value={pw} onChange={e => { setPw(e.target.value); setErr(false); }}
          onKeyDown={e => { if (e.key === 'Enter') { if (pw === ADMIN_PASSWORD) onConfirm(); else setErr(true); } }}
          className={err ? 'border-red-400' : ''} autoFocus />
        {err && <p className="text-xs text-red-500 mt-1">비밀번호가 올바르지 않습니다.</p>}
        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onCancel}>취소</Button>
          <Button className="flex-1" onClick={() => { if (pw === ADMIN_PASSWORD) onConfirm(); else setErr(true); }}>확인</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Product price helper ───────────────────────────────────────────────── */

interface PriceHint {
  code: string; nameKo: string; purchasePrice?: number; sellingPrice?: number;
  currency: string; recentQuotePrice?: number; recentQuoteCompany?: string; recentPoPrice?: number;
  voltage?: string; watts?: string; cct?: string; sizeSpec?: string; material?: string; converter?: string;
  detail?: string; specification?: string;
}

function ProductSearchHelper({
  value, products, quotes, onSelect, currency,
}: {
  value: string; products: any[]; quotes: Quote[]; onSelect: (p: PriceHint) => void; currency: string;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const matches = value.length >= 1 ? products.filter(p =>
    p.nameKo?.includes(value) || p.code?.includes(value) || (p.nameEn ?? '').includes(value)
  ).slice(0, 8) : [];

  // Build hints: for each match, find recent quote price
  const hints: PriceHint[] = matches.map(p => {
    const recentQuotes = quotes
      .flatMap(q => (q.items || []).filter((it: any) =>
        it.productName?.includes(p.nameKo?.slice(0, 6)) || it.productName?.includes(p.code)
      ).map((it: any) => ({ price: it.unitPrice, company: q.companyName, date: (q as any).quoteDate || q.createdAt })))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const ex = p as any;
    return {
      code: p.code,
      nameKo: p.nameKo,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      currency: p.currency || 'USD',
      recentQuotePrice: recentQuotes[0]?.price,
      recentQuoteCompany: recentQuotes[0]?.company,
      voltage: ex.voltage, watts: ex.watts, cct: ex.cct,
      sizeSpec: ex.sizeSpec, material: ex.material, converter: ex.converter, detail: ex.detail,
      specification: [ex.voltage, ex.watts, ex.cct].filter(Boolean).join(' / ') || ex.detail || '',
    };
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (hints.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setShow(v => !v)}
        className="text-primary hover:text-primary/80 ml-1 align-middle" title="가격 도움말">
        <Info className="w-3.5 h-3.5 inline" />
      </button>
      {show && (
        <div className="absolute left-0 top-5 z-50 bg-background border border-border rounded-xl shadow-xl w-80 max-h-72 overflow-y-auto">
          <div className="p-2 border-b bg-muted/30">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">제품 검색 결과 ({hints.length})</p>
          </div>
          {hints.map(h => (
            <button key={h.code} type="button" onClick={() => { onSelect(h); setShow(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{h.nameKo}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{h.code}</p>
                  {h.specification && <p className="text-[10px] text-muted-foreground mt-0.5">{h.specification}</p>}
                </div>
                <div className="text-right shrink-0">
                  {h.purchasePrice && (
                    <p className="text-xs font-bold text-blue-600">{h.currency} {h.purchasePrice.toFixed(2)}</p>
                  )}
                  {h.recentQuotePrice && (
                    <p className="text-[10px] text-emerald-600">최근견적 {h.currency} {h.recentQuotePrice.toFixed(2)}</p>
                  )}
                  {h.recentQuoteCompany && (
                    <p className="text-[9px] text-muted-foreground">{h.recentQuoteCompany}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Quote Image Upload ─────────────────────────────────────────────────── */

const MAX_QUOTE_IMAGES = 10;

function QuoteImageUpload({ images, quoteId, onChange }: { images: string[]; quoteId: string; onChange: (v: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/quotes/${quoteId}/upload`, { method: 'POST', body: fd });
      const j = await res.json();
      if (j.url) onChange([...images, j.url]);
      else alert(j.error || '업로드 실패');
    } finally { setUploading(false); }
  }, [images, quoteId, onChange]);

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">첨부 사진 (최대 {MAX_QUOTE_IMAGES}장)</p>
      <div className="flex flex-wrap gap-2">
        {images.map((url, i) => (
          <div key={i} className="relative group w-20 h-20 rounded-lg border overflow-hidden bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))}
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
        {images.length < MAX_QUOTE_IMAGES && (
          <button type="button" onClick={() => inputRef.current?.click()}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-1 transition-colors">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : (
              <><Upload className="w-5 h-5 text-muted-foreground" /><span className="text-[9px] text-muted-foreground">추가</span></>
            )}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" hidden accept="image/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
    </div>
  );
}

/* ─── Quote Modal ────────────────────────────────────────────────────────── */

function QuoteModal({
  item, companies, products, quotes, me, onClose, onSave,
}: {
  item?: Quote | null; companies: any[]; products: any[]; quotes: Quote[];
  me: { name: string; role: string } | null; onClose: () => void; onSave: () => void;
}) {
  const q = item as any;
  const quoteId = item?.id || ('QT-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const [images, setImages] = useState<string[]>(() => {
    try { return JSON.parse(q?.imagesJson || '[]'); } catch { return []; }
  });
  const [companySearch, setCompanySearch] = useState(item?.companyName || '');
  const [showCompanyList, setShowCompanyList] = useState(false);
  const companyRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    type: (item?.type || 'customer') as string,
    companyName: item?.companyName || '',
    companyId: item?.companyId || '',
    quoteDate: (q?.quoteDate || new Date().toISOString().slice(0, 10)),
    currency: item?.currency || 'KRW',
    validity: item?.validity || '',
    paymentTerms: item?.paymentTerms || '',
    incoterm: item?.incoterm || '',
    status: (item?.status || 'draft') as string,
    remark: (item?.remark || ''),
    items: (item?.items?.length
      ? item.items.map((i: any, idx: number) => ({
          id: String(idx) + Date.now(),
          productName: i.productName || '',
          specification: i.specification || '',
          voltage: i.voltage || '',
          watts: i.watts || '',
          cct: i.cct || '',
          quantity: i.quantity ?? i.qty ?? 1,
          moq: i.moq ?? 0,
          unitPrice: i.unitPrice ?? 0,
          amount: i.amount ?? ((i.quantity ?? i.qty ?? 1) * (i.unitPrice ?? 0)),
          remark: i.remark || '',
        }))
      : [emptyItem()]) as any[],
  });
  const [saving, setSaving] = useState(false);
  const [specMode, setSpecMode] = useState<Record<number, 'auto' | 'manual'>>({});

  const filteredCompanies = companies.filter(c =>
    c.name.includes(companySearch) || (c.nameEn ?? '').toLowerCase().includes(companySearch.toLowerCase())
  ).slice(0, 8);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (companyRef.current && !companyRef.current.contains(e.target as Node)) setShowCompanyList(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const updateItem = (idx: number, field: string, val: string | number) => {
    setForm(f => {
      const items = [...f.items];
      (items[idx] as any)[field] = val;
      if (['quantity', 'unitPrice'].includes(field)) {
        items[idx].amount = (items[idx].quantity ?? 0) * (items[idx].unitPrice ?? 0);
      }
      return { ...f, items };
    });
  };

  const applyProductHint = (idx: number, h: PriceHint) => {
    setForm(f => {
      const items = [...f.items];
      const price = h.recentQuotePrice ?? h.purchasePrice ?? 0;
      const spec = [h.voltage, h.watts, h.cct].filter(Boolean).join(' / ') || h.detail || '';
      items[idx] = {
        ...items[idx],
        productName: h.nameKo,
        specification: specMode[idx] !== 'manual' ? spec : items[idx].specification,
        voltage: h.voltage || items[idx].voltage,
        watts: h.watts || items[idx].watts,
        cct: h.cct || items[idx].cct,
        unitPrice: price,
        amount: (items[idx].quantity ?? 1) * price,
      };
      return { ...f, items };
    });
  };

  const totalAmount = form.items.reduce((s, i) => s + (i.amount || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        totalAmount,
        quoteDate: form.quoteDate,
        imagesJson: images.length > 0 ? JSON.stringify(images) : null,
        createdByName: me?.name || 'user-1',
        updatedByName: me?.name || 'user-1',
      };
      if (item) {
        await fetch(`/api/quotes/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[96vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">{item ? '견적 수정' : '새 견적'}</h2>
            {item && (q?.createdByName || q?.created_by_name) && (
              <span className="text-xs text-muted-foreground">작성: {q.createdByName || q.created_by_name}</span>
            )}
            {item && (q?.updatedBy || q?.updated_by) && (
              <span className="text-xs text-muted-foreground">수정: {q.updatedBy || q.updated_by}</span>
            )}
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">

          {/* Row 1: type / company / date / currency / status */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">유형</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="customer">판매견적</option>
                <option value="supplier">구매견적</option>
              </select>
            </div>
            <div className="md:col-span-2" ref={companyRef}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">거래처 *</label>
              <div className="relative">
                <Input value={companySearch}
                  onChange={e => { setCompanySearch(e.target.value); setForm(f => ({ ...f, companyName: e.target.value, companyId: '' })); setShowCompanyList(true); }}
                  onFocus={() => setShowCompanyList(true)}
                  placeholder="거래처 검색..." required className="h-9" />
                {showCompanyList && filteredCompanies.length > 0 && (
                  <div className="absolute top-full left-0 z-50 w-full bg-background border border-border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {filteredCompanies.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => { setForm(f => ({ ...f, companyName: c.name, companyId: c.id })); setCompanySearch(c.name); setShowCompanyList(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between">
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">견적일</label>
              <Input type="date" value={form.quoteDate} onChange={e => setForm(f => ({ ...f, quoteDate: e.target.value }))} className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: validity / payment / incoterm / currency */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">유효기한</label>
              <Input type="date" value={form.validity} onChange={e => setForm(f => ({ ...f, validity: e.target.value }))} className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">결제조건</label>
              <Input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="30 days net" className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">인코텀</label>
              <Input value={form.incoterm} onChange={e => setForm(f => ({ ...f, incoterm: e.target.value }))} placeholder="FOB Ningbo" className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>KRW</option><option>USD</option><option>EUR</option><option>CNY</option>
              </select>
            </div>
          </div>

          {/* Items table */}
          <div className="border rounded-xl overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-6">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">품목</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-48">규격</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-16">수량</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-24">단가</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-28">금액</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-32">비고</th>
                  <th className="px-3 py-2 w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {form.items.map((it, idx) => (
                  <tr key={(it as any).id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          className="flex-1 bg-transparent border-none outline-none text-xs min-w-0"
                          value={it.productName}
                          onChange={e => updateItem(idx, 'productName', e.target.value)}
                          placeholder="품목명 입력..."
                        />
                        <ProductSearchHelper
                          value={it.productName}
                          products={products}
                          quotes={quotes}
                          currency={form.currency}
                          onSelect={h => applyProductHint(idx, h)}
                        />
                      </div>
                      {/* Spec sub-row */}
                      <div className="flex items-center gap-1 mt-0.5">
                        <button type="button"
                          onClick={() => setSpecMode(m => ({ ...m, [idx]: m[idx] === 'manual' ? 'auto' : 'manual' }))}
                          className="text-[9px] text-muted-foreground/60 hover:text-primary shrink-0">
                          {specMode[idx] === 'manual' ? '자동' : '직접'}
                        </button>
                        {specMode[idx] === 'manual' ? (
                          <input className="flex-1 bg-transparent border-none outline-none text-[10px] text-muted-foreground"
                            value={it.specification} onChange={e => updateItem(idx, 'specification', e.target.value)}
                            placeholder="규격 직접 입력..." />
                        ) : (
                          <span className="text-[10px] text-muted-foreground flex gap-1.5">
                            {it.voltage && <span className="bg-blue-50 text-blue-600 px-1 rounded">{it.voltage}</span>}
                            {it.watts && <span className="bg-orange-50 text-orange-600 px-1 rounded">{it.watts}W</span>}
                            {it.cct && <span className="bg-yellow-50 text-yellow-700 px-1 rounded">{it.cct}</span>}
                            {!it.voltage && !it.watts && !it.cct && it.specification && <span>{it.specification}</span>}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <input className="w-full bg-transparent border-none outline-none text-xs"
                        value={it.specification} onChange={e => updateItem(idx, 'specification', e.target.value)}
                        placeholder="규격" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0"
                        className="w-full bg-transparent border-none outline-none text-xs text-right"
                        value={it.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.01"
                        className="w-full bg-transparent border-none outline-none text-xs text-right"
                        value={it.unitPrice} onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold">
                      {(it.amount || 0).toLocaleString('ko-KR', { minimumFractionDigits: form.currency === 'KRW' ? 0 : 2 })}
                    </td>
                    <td className="px-2 py-1.5">
                      <input className="w-full bg-transparent border-none outline-none text-xs text-muted-foreground"
                        value={(it as any).remark || ''} onChange={e => updateItem(idx, 'remark', e.target.value)}
                        placeholder="비고" />
                    </td>
                    <td className="px-2 py-1.5">
                      <button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                        className="text-muted-foreground/40 hover:text-red-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t flex items-center justify-between bg-muted/20">
              <button type="button"
                onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> 품목 추가
              </button>
              <div className="text-right">
                <span className="text-xs text-muted-foreground mr-2">합계</span>
                <span className="text-sm font-bold">{form.currency} {totalAmount.toLocaleString('ko-KR', { minimumFractionDigits: form.currency === 'KRW' ? 0 : 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Remark / images */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">비고 / 특기사항</label>
              <textarea value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
                placeholder="특기사항, 배송조건, 주의사항 등..."
                className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <QuoteImageUpload images={images} quoteId={quoteId} onChange={setImages} />
          </div>

          {/* History */}
          {item && (() => {
            const hist: any[] = JSON.parse((q?.historyJson || q?.history_json || '[]'));
            if (!hist.length) return null;
            return (
              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> 수정 이력 ({hist.length})
                </p>
                <div className="space-y-1">
                  {hist.slice(-5).reverse().map((h, i) => (
                    <div key={i} className="flex gap-3 text-xs text-muted-foreground">
                      <span className="whitespace-nowrap">{h.at?.slice(0, 16)}</span>
                      <span className="font-medium">{h.by}</span>
                      <span>{h.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

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

/* ─── Print Modal ────────────────────────────────────────────────────────── */

function QuotePrintModal({ quote, company, onClose }: { quote: Quote; company: CompanySettings; onClose: () => void }) {
  const q = quote as any;
  const items = (quote.items || []) as any[];
  const totalAmount = items.reduce((s: number, i: any) => s + (i.amount || (i.unitPrice ?? 0) * (i.quantity ?? i.qty ?? 0)), 0);
  const quoteDate = q.quoteDate || new Date().toISOString().slice(0, 10);
  const dateStr = new Date(quoteDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const isCustomer = quote.type === 'customer';
  const quoteImages: string[] = (() => { try { return JSON.parse(q.imagesJson || '[]'); } catch { return []; } })();

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #quote-print-area, #quote-print-area * { visibility: visible !important; }
          #quote-print-area { position: fixed; left: 0; top: 0; width: 210mm; padding: 12mm !important; }
          .no-print { display: none !important; }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
      <div className="no-print fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[900px]">
          <div className="flex items-center justify-between p-4 border-b no-print">
            <span className="font-semibold text-sm text-gray-800">견적서 미리보기</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> 인쇄 / PDF
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>
          </div>

          <div id="quote-print-area" style={{ width: '210mm', minHeight: '297mm', padding: '14mm', background: 'white', fontFamily: '"Malgun Gothic", Arial, sans-serif', color: '#111', fontSize: '9pt', lineHeight: '1.5' }}>

            {/* Title bar */}
            <div style={{ textAlign: 'center', marginBottom: '16px', borderBottom: '3px solid #1a1a2e', paddingBottom: '10px' }}>
              <div style={{ fontSize: '22pt', fontWeight: 'bold', letterSpacing: '6px', color: '#1a1a2e' }}>
                {isCustomer ? '견 적 서' : '구매견적서'}
              </div>
            </div>

            {/* Header: logo left, ref right */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                {company.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={company.logoUrl} alt="logo" style={{ maxHeight: '48px', maxWidth: '160px', objectFit: 'contain' }} />
                ) : (
                  <div style={{ fontSize: '14pt', fontWeight: 'bold', color: '#1a1a2e' }}>{company.name}</div>
                )}
              </div>
              <div style={{ textAlign: 'right', fontSize: '8.5pt' }}>
                <div style={{ marginBottom: '3px' }}><span style={{ color: '#666' }}>견적번호: </span><strong>{quote.businessId}</strong></div>
                <div style={{ marginBottom: '3px' }}><span style={{ color: '#666' }}>견적일: </span>{dateStr}</div>
                {quote.validity && <div><span style={{ color: '#666' }}>유효기한: </span>{quote.validity}</div>}
              </div>
            </div>

            {/* From / To */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ border: '1px solid #ccc', borderRadius: '6px', padding: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                  {isCustomer ? '공급자 (Seller)' : '구매자 (Buyer)'}
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '10pt', marginBottom: '3px' }}>{company.name}</div>
                {company.ceo && <div style={{ marginBottom: '2px', fontSize: '8.5pt' }}>대표자: {company.ceo}</div>}
                {company.bizNo && <div style={{ marginBottom: '2px', fontSize: '8.5pt' }}>사업자번호: {company.bizNo}</div>}
                {company.address && <div style={{ marginBottom: '2px', fontSize: '8.5pt' }}>{company.address}</div>}
                {company.tel && <div style={{ marginBottom: '2px', fontSize: '8.5pt' }}>TEL: {company.tel}</div>}
                {company.fax && <div style={{ marginBottom: '2px', fontSize: '8.5pt' }}>FAX: {company.fax}</div>}
                {company.email && <div style={{ fontSize: '8.5pt' }}>E-mail: {company.email}</div>}
              </div>
              <div style={{ border: '1px solid #ccc', borderRadius: '6px', padding: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                  {isCustomer ? '공급받는자 (Buyer)' : '공급자 (Supplier)'}
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '10pt' }}>{quote.companyName}</div>
              </div>
            </div>

            {/* Items table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '8.5pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#1a1a2e', color: 'white' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '28px', borderRight: '1px solid #333' }}>No</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderRight: '1px solid #333' }}>품목 / 규격</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '50px', borderRight: '1px solid #333' }}>단위</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', width: '50px', borderRight: '1px solid #333' }}>수량</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', width: '80px', borderRight: '1px solid #333' }}>단가</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', width: '90px', borderRight: '1px solid #333' }}>금액</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '80px' }}>비고</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, idx: number) => {
                  const amt = it.amount || (it.unitPrice ?? 0) * (it.quantity ?? it.qty ?? 0);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '5px 8px' }}>
                        <div style={{ fontWeight: 600 }}>{it.productName}</div>
                        {it.specification && <div style={{ color: '#555', fontSize: '7.5pt' }}>{it.specification}</div>}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'center', color: '#555' }}>EA</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{(it.quantity ?? it.qty ?? 0).toLocaleString()}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                        {quote.currency !== 'KRW'
                          ? `${quote.currency} ${(it.unitPrice ?? 0).toFixed(2)}`
                          : (it.unitPrice ?? 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>
                        {quote.currency !== 'KRW' ? `${quote.currency} ${amt.toFixed(2)}` : amt.toLocaleString()}
                      </td>
                      <td style={{ padding: '5px 8px', fontSize: '7.5pt', color: '#666' }}>{it.remark || ''}</td>
                    </tr>
                  );
                })}
                {/* Empty rows to fill space */}
                {items.length < 8 && Array.from({ length: 8 - items.length }).map((_, i) => (
                  <tr key={`empty-${i}`} style={{ borderBottom: '1px solid #e5e5e5', height: '22px' }}>
                    <td colSpan={7}></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #1a1a2e', backgroundColor: '#f0f0f5' }}>
                  <td colSpan={5} style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '10pt' }}>합 계</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '10pt' }}>
                    {quote.currency !== 'KRW' ? `${quote.currency} ${totalAmount.toFixed(2)}` : `${totalAmount.toLocaleString()} 원`}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            {/* Terms */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px', fontSize: '8.5pt' }}>
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '8px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '5px', textTransform: 'uppercase' }}>거래 조건</div>
                {quote.paymentTerms && <div style={{ marginBottom: '2px' }}>결제: {quote.paymentTerms}</div>}
                {quote.incoterm && <div style={{ marginBottom: '2px' }}>인코텀: {quote.incoterm}</div>}
                {quote.validity && <div>유효기한: {quote.validity}</div>}
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '8px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '5px', textTransform: 'uppercase' }}>은행 정보</div>
                {company.bankForeign1 ? (
                  <div style={{ fontFamily: 'monospace', fontSize: '8pt', whiteSpace: 'pre-line' }}>{company.bankForeign1}</div>
                ) : company.bank ? (
                  <div style={{ fontSize: '8pt', whiteSpace: 'pre-line' }}>{company.bank}</div>
                ) : null}
              </div>
            </div>

            {/* Remark */}
            {quote.remark && (
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '8px', marginBottom: '14px', fontSize: '8.5pt' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>비고 / 특기사항</div>
                <div style={{ whiteSpace: 'pre-line' }}>{quote.remark}</div>
              </div>
            )}

            {/* Product images */}
            {quoteImages.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '6px', textTransform: 'uppercase' }}>제품 사진</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {quoteImages.map((url, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img key={i} src={url} alt="" style={{ width: '80mm', maxHeight: '60mm', objectFit: 'contain', border: '1px solid #eee', borderRadius: '4px' }} />
                  ))}
                </div>
              </div>
            )}

            {/* Signature */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <div style={{ textAlign: 'center', minWidth: '160px' }}>
                <div style={{ fontSize: '8pt', color: '#666', marginBottom: '6px' }}>공급자 확인</div>
                <div style={{ borderBottom: '1px solid #999', marginBottom: '4px', height: '40px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {company.stampUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={company.stampUrl} alt="stamp" style={{ maxHeight: '36px', maxWidth: '80px', objectFit: 'contain', opacity: 0.85 }} />
                  )}
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '9pt' }}>{company.name}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);

  const [modal, setModal] = useState<{ open: boolean; item?: Quote | null }>({ open: false });
  const [printModal, setPrintModal] = useState<{ open: boolean; item?: Quote | null }>({ open: false });
  const [adminModal, setAdminModal] = useState<{ open: boolean; action: () => void }>({ open: false, action: () => {} });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const load = async () => {
    setLoading(true);
    const [qRes, cRes, pRes, meRes, csRes] = await Promise.all([
      fetch('/api/quotes').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
      fetch('/api/settings/company').then(r => r.json()),
    ]);
    if (qRes.data) setQuotes(qRes.data);
    if (cRes.data) setCompanies(cRes.data);
    if (pRes.data) setProducts(pRes.data);
    if (meRes.user) setMe(meRes.user);
    if (csRes.data) setCompany(csRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Guard edit: previous month quotes require admin
  const guardEdit = (quote: Quote, action: () => void) => {
    if (isPrevMonth((quote as any).quoteDate || quote.createdAt)) {
      setAdminModal({ open: true, action });
    } else {
      action();
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    await fetch(`/api/quotes/${deleteConfirm.id}`, { method: 'DELETE' });
    setDeleteConfirm({ open: false, id: '' });
    load();
  };

  const handleCopy = async (q: Quote) => {
    const body = {
      type: q.type,
      companyName: q.companyName,
      companyId: q.companyId,
      currency: q.currency,
      paymentTerms: q.paymentTerms,
      incoterm: q.incoterm,
      status: 'draft',
      quoteDate: new Date().toISOString().slice(0, 10),
      items: q.items,
      remark: q.remark,
      createdByName: me?.name || 'user-1',
    };
    await fetch('/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  };

  const filtered = quotes.filter(q => {
    const ms = q.businessId.includes(search) || q.companyName.includes(search) || q.items.some(i => i.productName.includes(search));
    const mf = statusFilter === '전체' || q.status === statusFilter;
    return ms && mf;
  });

  const statuses = ['전체', ...Object.keys(statusLabel).filter(s => quotes.some(q => q.status === s))];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="견적" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="견적번호, 거래처, 품목 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {statuses.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors',
                  statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
                {s === '전체' ? '전체' : statusLabel[s]}
              </button>
            ))}
            <span className="text-xs text-muted-foreground hidden sm:block">{filtered.length}건</span>
            <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setModal({ open: true, item: null })}>
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">새 견적</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">견적번호</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">견적일</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden lg:table-cell">유형</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">거래처</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden lg:table-cell">품목</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">금액</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden xl:table-cell">유효기한</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">상태</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(q => {
                    const qx = q as any;
                    const prevMonth = isPrevMonth(qx.quoteDate || q.createdAt);
                    const totalAmt = qx.totalAmount || q.items.reduce((s: number, i: any) => s + (i.amount || (i.unitPrice ?? 0) * (i.quantity ?? i.qty ?? 0)), 0);
                    return (
                      <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {q.businessId}
                            {prevMonth && <Lock className="w-3 h-3 text-orange-400" aria-label="전월 견적 (관리자만 수정)" />}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{(qx.quoteDate || q.createdAt?.slice(0, 10)) ?? '-'}</td>
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap', typeStyle[q.type])}>{typeLabel[q.type]}</span>
                        </td>
                        <td className="px-3 py-3 font-medium"><span className="truncate block max-w-[150px]">{q.companyName}</span></td>
                        <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                          <span className="truncate block max-w-[180px]">{q.items.map(i => i.productName).filter(Boolean).join(', ') || '-'}</span>
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-semibold whitespace-nowrap">
                          {totalAmt > 0
                            ? (q.currency !== 'KRW' ? `${q.currency} ${totalAmt.toFixed(2)}` : `₩${totalAmt.toLocaleString()}`)
                            : '-'}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap hidden xl:table-cell">{q.validity ?? '-'}</td>
                        <td className="px-3 py-3">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap', statusStyle[q.status])}>{statusLabel[q.status]}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" title="견적서 출력"
                              onClick={() => setPrintModal({ open: true, item: q })}>
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="복사"
                              onClick={() => handleCopy(q)}>
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => guardEdit(q, () => setModal({ open: true, item: q }))}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                              onClick={() => handleDelete(q.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-14 text-center text-sm text-muted-foreground">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />견적 내역이 없습니다.
                </div>
              )}
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-2">
              {filtered.map(q => {
                const qx = q as any;
                const totalAmt = qx.totalAmount || q.items.reduce((s: number, i: any) => s + (i.amount || (i.unitPrice ?? 0) * (i.quantity ?? i.qty ?? 0)), 0);
                return (
                  <div key={q.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">{q.businessId}</p>
                        <p className="font-semibold text-sm">{q.companyName}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', typeStyle[q.type])}>{typeLabel[q.type]}</span>
                        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', statusStyle[q.status])}>{statusLabel[q.status]}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-1">{q.items.map(i => i.productName).filter(Boolean).join(', ')}</p>
                    {totalAmt > 0 && (
                      <p className="text-sm font-bold mb-2">
                        {q.currency !== 'KRW' ? `${q.currency} ${totalAmt.toFixed(2)}` : `₩${totalAmt.toLocaleString()}`}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-2">
                      <span className="text-xs text-muted-foreground flex-1">{qx.quoteDate || q.createdAt?.slice(0, 10)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => setPrintModal({ open: true, item: q })}><Printer className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => handleCopy(q)}><Copy className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => guardEdit(q, () => setModal({ open: true, item: q }))}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(q.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">견적이 없습니다.</div>}
            </div>
          </>
        )}
      </div>

      {/* Quote modal */}
      {modal.open && (
        <QuoteModal
          item={modal.item}
          companies={companies}
          products={products}
          quotes={quotes}
          me={me}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }}
        />
      )}

      {/* Print modal */}
      {printModal.open && printModal.item && company && (
        <QuotePrintModal quote={printModal.item} company={company} onClose={() => setPrintModal({ open: false })} />
      )}

      {/* Admin password modal */}
      {adminModal.open && (
        <AdminPasswordModal
          onConfirm={() => { setAdminModal({ open: false, action: () => {} }); adminModal.action(); }}
          onCancel={() => setAdminModal({ open: false, action: () => {} })}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
          <div className="bg-background rounded-xl shadow-2xl p-6 w-80">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="font-semibold">견적 삭제</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">이 견적서를 삭제하시겠습니까?<br />삭제 후 복구할 수 없습니다.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm({ open: false, id: '' })}>취소</Button>
              <Button variant="destructive" className="flex-1" onClick={confirmDelete}>삭제</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
