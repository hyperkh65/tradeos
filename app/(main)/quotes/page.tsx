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
  return { id: Date.now().toString() + Math.random(), productName: '', specification: '', voltage: '', watts: '', luminousEff: '', lumenOutput: '', cct: '', unit: 'PCS', quantity: 1, moq: 0, unitPrice: 0, amount: 0, remark: '' };
}

const getCurrencySymbol = (cur: string) => {
  if (cur === 'USD') return '$';
  if (cur === 'KRW') return '₩';
  if (cur === 'CNY' || cur === 'RMB') return '¥';
  if (cur === 'EUR') return '€';
  return '';
};

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
        it.productName === p.nameKo || it.productName === p.code ||
        (p.code && it.productName?.includes(p.code))
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

  if (value.length < 1) return null;

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
          {hints.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">등록된 제품 없음</div>
          ) : hints.map(h => (
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
    docType: (q?.docType || 'QUOTE') as string,
    companyName: item?.companyName || '',
    companyId: item?.companyId || '',
    quoteDate: (q?.quoteDate || new Date().toISOString().slice(0, 10)),
    currency: item?.currency || 'USD',
    validity: item?.validity || (() => { const d = new Date(q?.quoteDate || new Date()); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })(),
    paymentTerms: item?.paymentTerms || '',
    incoterm: item?.incoterm || '',
    status: (item?.status || 'draft') as string,
    remark: (item?.remark || ''),
    specialNotes: (q?.specialNotes || ''),
    generalInfo: (q?.generalInfo || ''),
    items: (item?.items?.length
      ? item.items.map((i: any, idx: number) => ({
          id: String(idx) + Date.now(),
          productName: i.productName || '',
          specification: i.specification || '',
          voltage: i.voltage || '',
          watts: i.watts || '',
          luminousEff: i.luminousEff || '',
          lumenOutput: i.lumenOutput || '',
          cct: i.cct || '',
          unit: i.unit || 'PCS',
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
      const ex = h as any;
      const spec = [h.voltage, h.watts, h.cct].filter(Boolean).join(' / ') || h.detail || '';
      items[idx] = {
        ...items[idx],
        productName: h.nameKo,
        specification: specMode[idx] !== 'manual' ? spec : items[idx].specification,
        voltage: h.voltage || items[idx].voltage,
        watts: h.watts || items[idx].watts,
        luminousEff: ex.luminousEff || items[idx].luminousEff,
        lumenOutput: ex.lumenOutput || items[idx].lumenOutput,
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
        docType: form.docType,
        specialNotes: form.specialNotes,
        generalInfo: form.generalInfo,
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

          {/* Row 1: docType / type / company / date / currency / status */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">문서유형</label>
              <select value={form.docType} onChange={e => setForm(f => ({ ...f, docType: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-semibold">
                <option value="QUOTE">QUOTATION</option>
                <option value="PROFORMA">PROFORMA</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">견적유형</label>
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
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold text-muted-foreground w-6">#</th>
                  <th className="px-2 py-2 text-left font-semibold text-muted-foreground min-w-[160px]">품목</th>
                  <th className="px-2 py-2 text-left font-semibold text-muted-foreground w-32">규격/설명</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground w-14">Volt</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground w-14">Watt</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground w-16">Eff</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground w-16">Lumen</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground w-16">CCT</th>
                  <th className="px-2 py-2 text-center font-semibold text-muted-foreground w-14">Unit</th>
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground w-14">수량</th>
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground w-22">단가</th>
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground w-24">금액</th>
                  <th className="px-2 py-2 text-left font-semibold text-muted-foreground w-24">비고</th>
                  <th className="px-2 py-2 w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {form.items.map((it, idx) => (
                  <tr key={(it as any).id} className="hover:bg-muted/20">
                    <td className="px-2 py-2 text-muted-foreground">{idx + 1}</td>
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
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-0.5">
                        <input className="flex-1 bg-transparent border-none outline-none text-xs min-w-0"
                          value={it.specification} onChange={e => updateItem(idx, 'specification', e.target.value)}
                          placeholder="규격/설명" />
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
                    {(['voltage', 'watts', 'luminousEff', 'lumenOutput', 'cct'] as const).map(field => (
                      <td key={field} className="px-1 py-1.5">
                        <input className="w-full bg-transparent border-none outline-none text-xs text-center"
                          value={(it as any)[field] || ''} onChange={e => updateItem(idx, field, e.target.value)}
                          placeholder="-" />
                      </td>
                    ))}
                    <td className="px-1 py-1.5">
                      <select value={(it as any).unit || 'PCS'} onChange={e => updateItem(idx, 'unit', e.target.value)}
                        className="w-full bg-transparent border-none outline-none text-xs text-center">
                        {['PCS', 'SET', 'EA', 'UNIT', 'BOX', 'M'].map(u => <option key={u}>{u}</option>)}
                      </select>
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
                    <td className="px-2 py-1.5 text-right font-semibold">
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

          {/* Remark / Special Notes / GeneralInfo / images */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">비고 (내부 — 미출력)</label>
              <textarea value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
                placeholder="내부 메모..."
                className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Terms &amp; Special Notes <span className="text-[10px] text-blue-500">(출력됨)</span></label>
              <textarea value={form.specialNotes} onChange={e => setForm(f => ({ ...f, specialNotes: e.target.value }))}
                placeholder="결제조건, 유효기간 등 TERMS 섹션에 출력될 내용..."
                className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">별도 표시 사항 <span className="text-[10px] text-blue-500">(출력됨)</span></label>
              <textarea value={form.generalInfo} onChange={e => setForm(f => ({ ...f, generalInfo: e.target.value }))}
                placeholder="품목 테이블 아래에 별도 출력될 사항..."
                className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
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

function QuotePrintModal({ quote, company, companies, products, onClose }: { quote: Quote; company: CompanySettings; companies: any[]; products: any[]; onClose: () => void }) {
  const q = quote as any;
  const items = (quote.items || []) as any[];
  const totalAmount = items.reduce((s: number, i: any) => s + (i.amount || (i.unitPrice ?? 0) * (i.quantity ?? i.qty ?? 0)), 0);
  const quoteDate = q.quoteDate || new Date().toISOString().slice(0, 10);
  const dateStr = new Date(quoteDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const docType = q.docType || 'QUOTE';
  const docTitle = docType === 'PROFORMA' ? 'PROFORMA INVOICE' : 'QUOTATION';
  const quoteImages: string[] = (() => { try { return JSON.parse(q.imagesJson || '[]'); } catch { return []; } })();
  const specialNotes = q.specialNotes || '';
  const generalInfo = q.generalInfo || '';
  const bankInfo = quote.currency === 'KRW' ? company.bank : (company.bankForeign1 || company.bank);
  const buyerCompany = companies.find((c: any) => c.name === quote.companyName);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #quote-print-area, #quote-print-area * { visibility: visible !important; }
          #quote-print-area { position: fixed !important; left: 0 !important; top: 0 !important; width: 210mm !important; min-height: 297mm !important; margin: 0 !important; padding: 10mm !important; z-index: 9999 !important; background: white !important; box-sizing: border-box !important; }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
        .qt-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .qt-table th { text-align: center; border-top: 2px solid #171717; border-bottom: 1px solid #171717; padding: 8px 3px; font-size: 10px; font-weight: 700; color: #171717; background: #f9f9f9; text-transform: uppercase; }
        .qt-table td { border-bottom: 1px solid #e5e5e5; padding: 8px 3px; font-size: 10px; color: #333; vertical-align: middle; }
        .qt-table tr:last-child td { border-bottom: 1px solid #171717; }
        .qt-box-wrap { display: flex; gap: 20px; margin-bottom: 24px; }
        .qt-box { flex: 1; border: 1px solid #e5e5e5; padding: 16px; border-radius: 8px; position: relative; }
        .qt-box-title { position: absolute; top: -9px; left: 12px; background: white; padding: 0 8px; font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        .qt-box-content { font-size: 12px; line-height: 1.6; color: #333; }
      `}</style>

      <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[900px]">
          <div className="no-print flex items-center justify-between p-4 border-b">
            <span className="font-semibold text-sm text-gray-800">{docTitle} 미리보기</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                const orig = document.title;
                document.title = quote.businessId;
                window.print();
                window.addEventListener('afterprint', () => { document.title = orig; }, { once: true });
              }}>
                <Printer className="w-4 h-4 mr-1" /> 인쇄 / PDF
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>
          </div>

          <div id="quote-print-area" style={{ width: '210mm', minHeight: '297mm', padding: '10mm', background: 'white', fontFamily: '"Noto Sans KR", "Malgun Gothic", Arial, sans-serif', color: '#171717', boxSizing: 'border-box', position: 'relative' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
              <div style={{ width: '28%' }}>
                {company.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={company.logoUrl} alt="Logo" style={{ height: '42px', objectFit: 'contain', display: 'block' }} />
                ) : (
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#171717' }}>{company.name}</div>
                )}
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '4px', margin: '0 0 4px 0', color: '#171717' }}>
                  {docTitle}
                </h1>
                <div style={{ width: '36px', height: '3px', background: '#171717', margin: '12px auto' }}></div>
              </div>
              <div style={{ width: '28%', textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px', textTransform: 'uppercase' }}>Reference No.</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#171717', marginBottom: '8px' }}>{quote.businessId}</div>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px', textTransform: 'uppercase' }}>Date</div>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#333' }}>{dateStr}</div>
                {quote.validity && (
                  <>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '6px', marginBottom: '2px', textTransform: 'uppercase' }}>Valid Until</div>
                    <div style={{ fontSize: '11px', color: '#333' }}>{quote.validity}</div>
                  </>
                )}
              </div>
            </div>

            {/* From (Seller) / To (Buyer) */}
            <div className="qt-box-wrap">
              <div className="qt-box" style={{ background: '#fafafa', border: 'none' }}>
                <div className="qt-box-title" style={{ background: '#fafafa' }}>From (Seller)</div>
                <div className="qt-box-content">
                  <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '8px', color: '#171717' }}>{company.name}</div>
                  {company.address && <div style={{ marginBottom: '2px', fontSize: '11px' }}>{company.address}</div>}
                  {(company.tel || company.fax) && <div style={{ marginBottom: '2px', fontSize: '11px' }}>Tel: {company.tel}{company.fax ? ` / Fax: ${company.fax}` : ''}</div>}
                  {company.email && <div style={{ fontSize: '11px' }}>Email: {company.email}</div>}
                </div>
              </div>
              <div className="qt-box">
                <div className="qt-box-title">To (Buyer)</div>
                <div className="qt-box-content">
                  <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '6px', color: '#171717' }}>{quote.companyName}</div>
                  {buyerCompany?.businessNo && <div style={{ marginBottom: '2px', fontSize: '10px', color: '#666' }}>Reg.No: {buyerCompany.businessNo}</div>}
                  {buyerCompany?.ceo && <div style={{ marginBottom: '2px', fontSize: '10px', color: '#666' }}>CEO: {buyerCompany.ceo}</div>}
                  {buyerCompany?.address && <div style={{ marginBottom: '2px', fontSize: '11px' }}>{buyerCompany.address}</div>}
                  {buyerCompany?.phone && <div style={{ marginBottom: '2px', fontSize: '11px' }}>Tel: {buyerCompany.phone}</div>}
                  {buyerCompany?.email && <div style={{ fontSize: '11px' }}>Email: {buyerCompany.email}</div>}
                </div>
              </div>
            </div>

            {/* Items table */}
            <table className="qt-table">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}>No</th>
                  <th style={{ textAlign: 'left', paddingLeft: '8px', width: '24%' }}>Description / Specifications</th>
                  <th style={{ width: '14%' }}>Tech Detail</th>
                  <th style={{ width: '6%' }}>Unit</th>
                  <th style={{ width: '7%' }}>Qty</th>
                  <th style={{ width: '13%', textAlign: 'right', paddingRight: '6px' }}>Unit Price</th>
                  <th style={{ width: '15%', textAlign: 'right', paddingRight: '6px' }}>Amount</th>
                  <th style={{ width: '17%' }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, i: number) => {
                  const amt = it.amount || (it.unitPrice ?? 0) * (it.quantity ?? it.qty ?? 0);
                  const prod = products.find((p: any) => p.nameKo === it.productName || p.code === it.productName);
                  const tv = it.voltage || prod?.voltage || '';
                  const tw = it.watts || prod?.watts || '';
                  const tc = it.cct || prod?.cct || '';
                  const te = it.luminousEff || '';
                  const tl = it.lumenOutput || '';
                  const techParts = [
                    tv && `${tv}V`,
                    tw && `${tw}W`,
                    te && `${te}lm/W`,
                    tc && tc,
                  ].filter(Boolean);
                  return (
                    <tr key={i}>
                      <td style={{ textAlign: 'center', color: '#888' }}>{i + 1}</td>
                      <td style={{ paddingLeft: '8px' }}>
                        <div style={{ fontWeight: 600, color: '#171717', fontSize: '11px' }}>{it.productName}</div>
                        {it.specification && <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>{it.specification}</div>}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '9px', color: '#666', lineHeight: '1.4' }}>
                        {techParts.length > 0 ? techParts.join(' / ') : '-'}
                        {tl && <><br />{tl}lm</>}
                      </td>
                      <td style={{ textAlign: 'center' }}>{it.unit || 'PCS'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{(it.quantity ?? it.qty ?? 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', paddingRight: '6px' }}>
                        {getCurrencySymbol(quote.currency)}{quote.currency !== 'KRW' ? (it.unitPrice ?? 0).toFixed(2) : (it.unitPrice ?? 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: '6px', fontWeight: 700, color: '#171717' }}>
                        {getCurrencySymbol(quote.currency)}{quote.currency !== 'KRW' ? amt.toFixed(2) : amt.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '9px', color: '#888' }}>{it.remark || ''}</td>
                    </tr>
                  );
                })}
                {items.length < 8 && Array.from({ length: 8 - items.length }).map((_, i) => (
                  <tr key={`empty-${i}`}>
                    <td style={{ padding: '14px' }}></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Grand Total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', marginBottom: '30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#666' }}>GRAND TOTAL ({quote.currency})</div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#171717' }}>
                  {getCurrencySymbol(quote.currency)}{quote.currency !== 'KRW' ? totalAmount.toFixed(2) : totalAmount.toLocaleString()}
                </div>
              </div>
            </div>

            {/* 별도표시 사항 */}
            {generalInfo && (
              <div style={{ border: '1px solid #e5e5e5', borderRadius: '4px', padding: '10px 14px', marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#171717', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>별도 표시 사항</div>
                <div style={{ fontSize: '10px', color: '#555', whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{generalInfo}</div>
              </div>
            )}

            {/* Terms & Bank / Signature */}
            <div style={{ display: 'flex', gap: '24px', marginTop: '20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#171717', marginBottom: '8px', textTransform: 'uppercase' }}>Terms &amp; Conditions</div>
                <div style={{ fontSize: '11px', color: '#555', lineHeight: '1.6', borderTop: '1px solid #e5e5e5', paddingTop: '8px' }}>
                  {quote.paymentTerms && <div style={{ marginBottom: '4px' }}>• Payment: {quote.paymentTerms}</div>}
                  {quote.incoterm && <div style={{ marginBottom: '4px' }}>• Incoterm: {quote.incoterm}</div>}
                  {quote.validity && <div style={{ marginBottom: '4px' }}>• Valid Until: {quote.validity}</div>}
                  {specialNotes && <div style={{ marginBottom: '8px', whiteSpace: 'pre-wrap' }}>{specialNotes}</div>}
                  {bankInfo && (
                    <div style={{ background: '#f5f5f5', padding: '8px', borderRadius: '4px', marginTop: '8px' }}>
                      <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '10px' }}>Bank Account</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '10px', whiteSpace: 'pre-line' }}>{bankInfo}</div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ width: '220px', display: 'flex', flexDirection: 'column', height: '140px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#171717', marginBottom: '8px', textTransform: 'uppercase' }}>Authorized Signature</div>
                <div style={{ flex: 1, borderBottom: '2px solid #171717', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {company.stampUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={company.stampUrl} alt="Stamp" style={{ width: '200px', opacity: 0.8, transform: 'rotate(-5deg)', position: 'absolute' }} />
                  )}
                </div>
                <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, marginTop: '6px', color: '#171717' }}>{company.name}</div>
              </div>
            </div>

            {/* Product images (attachment page) */}
            {quoteImages.length > 0 && (
              <div style={{ pageBreakBefore: 'always', marginTop: '40px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '16px', borderBottom: '2px solid #171717', paddingBottom: '8px' }}>ATTACHMENTS</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {quoteImages.map((url, i) => (
                    <div key={i}>
                      <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px', color: '#888' }}>Attachment {i + 1}</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} style={{ maxWidth: '100%', border: '1px solid #e5e5e5', borderRadius: '4px' }} alt="" />
                    </div>
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
    const qx = q as any;
    const body = {
      type: q.type,
      docType: qx.docType || 'QUOTE',
      companyName: q.companyName,
      companyId: q.companyId,
      currency: q.currency,
      paymentTerms: q.paymentTerms,
      incoterm: q.incoterm,
      status: 'draft',
      quoteDate: new Date().toISOString().slice(0, 10),
      items: q.items,
      remark: q.remark,
      specialNotes: qx.specialNotes,
      generalInfo: qx.generalInfo,
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
        <QuotePrintModal quote={printModal.item} company={company} companies={companies} products={products} onClose={() => setPrintModal({ open: false })} />
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
