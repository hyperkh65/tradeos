'use client';

import { AppHeader } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Package, Plus, Search, X, Loader2, Pencil, Trash2, ImageIcon, Upload,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Zap, Sun, Thermometer,
  ArrowRight, Box, Layers, RefreshCw, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Product, Company } from '@/types';

function CompanyAutocomplete({ label, value, onChange, companies }: {
  label: string; value: string; onChange: (v: string) => void; companies: Company[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(value); }, [value]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = q.trim()
    ? companies.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || (c.nameEn ?? '').toLowerCase().includes(q.toLowerCase()))
    : companies;

  return (
    <div ref={ref} className="relative">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <Input
        value={q}
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={label + ' 검색...'}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 20).map(c => (
            <button key={c.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
              onMouseDown={() => { onChange(c.name); setQ(c.name); setOpen(false); }}>
              <span className="font-medium truncate">{c.name}</span>
              {c.nameEn && <span className="text-xs text-muted-foreground truncate">{c.nameEn}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductNameField({ value, onChange, allProducts, currentId }: {
  value: string; onChange: (v: string) => void;
  allProducts: Product[]; currentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = value.trim().toLowerCase();
  const suggestions = q.length >= 1
    ? allProducts.filter(p => p.id !== currentId && p.nameKo.toLowerCase().includes(q))
    : [];
  const exactDup = allProducts.find(p => p.id !== currentId && p.nameKo === value.trim());

  return (
    <div ref={ref} className="relative">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">제품명 (한글) *</label>
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="LED 패널 40W"
        required
        autoComplete="off"
        className={exactDup ? 'border-red-400 focus-visible:ring-red-400' : ''}
      />
      {exactDup && (
        <p className="text-xs text-red-500 mt-1">이미 등록된 제품명입니다 — {exactDup.code} · {exactDup.nameKo}</p>
      )}
      {open && !exactDup && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          <p className="px-3 py-1.5 text-[11px] text-muted-foreground border-b">유사한 제품명</p>
          {suggestions.slice(0, 10).map(p => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
              onMouseDown={() => { onChange(p.nameKo); setOpen(false); }}>
              <span className="text-xs text-muted-foreground shrink-0">{p.code}</span>
              <span className="font-medium truncate">{p.nameKo}</span>
              {p.nameEn && <span className="text-xs text-muted-foreground truncate">{p.nameEn}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORIES = ['조명', '가전', '전자', '생활용품', '산업용품', '기타'];
const MIN_IMAGE_SLOTS = 5;
const ADMIN_PASSWORD = '1209';
function isPrevMonth(d?: string) { if (!d) return false; const t = new Date(d), n = new Date(); return t.getFullYear() < n.getFullYear() || (t.getFullYear() === n.getFullYear() && t.getMonth() < n.getMonth()); }
function AdminPasswordModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(false);
  const check = () => { if (pw === ADMIN_PASSWORD) onConfirm(); else setErr(true); };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-xl shadow-2xl p-6 w-80">
        <div className="flex items-center gap-2 mb-3"><Lock className="w-5 h-5 text-orange-500" /><h3 className="font-semibold">전월 제품 수정</h3></div>
        <p className="text-sm text-muted-foreground mb-4">전월 등록 제품은 관리자만 수정할 수 있습니다.<br />관리자 비밀번호를 입력하세요.</p>
        <Input type="password" placeholder="비밀번호" value={pw} onChange={e => { setPw(e.target.value); setErr(false); }} onKeyDown={e => e.key === 'Enter' && check()} className={err ? 'border-red-400' : ''} autoFocus />
        {err && <p className="text-xs text-red-500 mt-1">비밀번호가 올바르지 않습니다.</p>}
        <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={onCancel}>취소</Button><Button className="flex-1" onClick={check}>확인</Button></div>
      </div>
    </div>
  );
}

/* ─── Exchange rates ─────────────────────────────────────────────────────── */

interface Rates { KRW: number; CNY: number; updatedAt: string }

function useExchangeRates() {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then(d => setRates({ KRW: d.rates?.KRW ?? 1340, CNY: d.rates?.CNY ?? 7.2, updatedAt: d.time_last_update_utc ?? '' }))
      .catch(() => setRates({ KRW: 1340, CNY: 7.2, updatedAt: '' }));
  }, []);
  return rates;
}

/* ─── Sparkline SVG ──────────────────────────────────────────────────────── */

function Sparkline({ values, w = 96, h = 32 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (w - 2 * pad),
    h - pad - ((v - min) / range) * (h - 2 * pad),
  ]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  const color = up ? '#16a34a' : '#dc2626';
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="overflow-visible shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

/* ─── Spec tags for list row ─────────────────────────────────────────────── */

function SpecTags({ product }: { product: Product }) {
  const ex = product as any;
  const tags: { label: string; cls: string }[] = [];
  if (ex.voltage) tags.push({ label: ex.voltage, cls: 'bg-blue-50 text-blue-700 border-blue-200' });
  if (ex.watts) tags.push({ label: `${ex.watts}W`, cls: 'bg-orange-50 text-orange-700 border-orange-200' });
  if (ex.cct) tags.push({ label: ex.cct, cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' });
  if (ex.inputA) tags.push({ label: `IN ${ex.inputA}`, cls: 'bg-green-50 text-green-700 border-green-200' });
  if (ex.outputV) tags.push({ label: `${ex.outputV}V`, cls: 'bg-purple-50 text-purple-700 border-purple-200' });
  if (ex.material) tags.push({ label: ex.material, cls: 'bg-gray-100 text-gray-600 border-gray-200' });
  if (ex.sizeSpec) tags.push({ label: ex.sizeSpec, cls: 'bg-gray-100 text-gray-600 border-gray-200' });

  if (tags.length === 0 && ex.detail) {
    return <span className="text-xs text-muted-foreground truncate block max-w-[200px]">{ex.detail}</span>;
  }
  if (tags.length === 0) return <span className="text-xs text-muted-foreground">-</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 4).map(t => (
        <span key={t.label} className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap', t.cls)}>{t.label}</span>
      ))}
      {tags.length > 4 && <span className="text-[10px] text-muted-foreground">+{tags.length - 4}</span>}
    </div>
  );
}

/* ─── Price cell ─────────────────────────────────────────────────────────── */

function PriceCell({ price, currency, rates }: { price?: number; currency: string; rates: Rates | null }) {
  if (!price) return <span className="text-xs text-muted-foreground">-</span>;
  const usd = Number(price);
  const krw = currency === 'USD' && rates ? Math.round(usd * rates.KRW) : null;
  return (
    <div className="text-right">
      <p className="text-sm font-semibold whitespace-nowrap">{currency} {usd.toFixed(2)}</p>
      {krw && <p className="text-[10px] text-muted-foreground">₩{krw.toLocaleString()}</p>}
    </div>
  );
}

/* ─── Product Detail Drawer ──────────────────────────────────────────────── */

function ProductDrawer({
  product, rates, pos, quotes, onClose, onEdit, onDelete,
}: {
  product: Product; rates: Rates | null;
  pos: any[]; quotes: any[]; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const ex = product as any;
  const imgs: string[] = ex.images?.length ? ex.images : ex.imageUrl ? [ex.imageUrl] : [];
  const [imgIdx, setImgIdx] = useState(0);
  const [tab, setTab] = useState<'info' | 'spec' | 'price'>('info');

  const isMatch = (name: string) =>
    name === product.nameKo || name === product.code ||
    (product.code && name.includes(product.code));

  // Purchase price history from POs
  const priceHistory = pos
    .flatMap((po: any) => (po.items || []).filter((it: any) => isMatch(it.productName || ''))
      .map((it: any) => ({ date: po.orderDate || po.createdAt || '', price: it.unitPrice || 0, company: po.supplierName || '' })))
    .filter((h: any) => h.price > 0)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  // Selling price history from Quotes
  const sellHistory = quotes
    .flatMap((q: any) => (q.items || []).filter((it: any) => isMatch(it.productName || ''))
      .map((it: any) => ({ date: q.quoteDate || q.createdAt || '', price: it.unitPrice || 0, company: q.companyName || '' })))
    .filter((h: any) => h.price > 0)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  const prices = priceHistory.map((h: any) => h.price);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const latestP = prices[prices.length - 1] ?? product.purchasePrice ?? 0;
  const prevP = prices[prices.length - 2];
  const trendPct = prevP ? ((latestP - prevP) / prevP) * 100 : null;
  const sellPrices = sellHistory.map((h: any) => h.price);

  const usd = Number(product.purchasePrice || 0);
  const krwPrice = usd && rates ? Math.round(usd * rates.KRW) : null;
  const cnyPrice = usd && rates ? (usd * rates.CNY).toFixed(2) : null;

  const specRows = [
    ['전압 (Voltage)', ex.voltage],
    ['와트 (Watts)', ex.watts],
    ['색온도 (CCT)', ex.cct],
    ['입력전류 (InputA)', ex.inputA],
    ['출력전압 (OutputV)', ex.outputV],
    ['출력전류 (OutputA)', ex.outputA],
    ['재질 (Material)', ex.material],
    ['크기 (Size)', ex.sizeSpec],
    ['컨버터 (Converter)', ex.converter],
  ].filter(([, v]) => v);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 cursor-pointer" onClick={onClose} />
      <div className="w-full max-w-md bg-background shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
          <button onClick={onClose} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> 목록
          </button>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5" /> 수정
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-red-500 hover:text-red-700" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Image carousel */}
          <div className="relative bg-muted/20 aspect-[4/3] shrink-0">
            {imgs.length > 0 ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={imgs[imgIdx]} alt="" className="w-full h-full object-contain"
                onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2'; }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-16 h-16 text-muted-foreground/20" />
              </div>
            )}
            {imgs.length > 1 && (
              <>
                <button onClick={() => setImgIdx(i => (i - 1 + imgs.length) % imgs.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setImgIdx(i => (i + 1) % imgs.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1">
                  {imgs.map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(i)}
                      className={cn('w-1.5 h-1.5 rounded-full transition-colors', i === imgIdx ? 'bg-white' : 'bg-white/40')} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Thumbnail strip */}
          {imgs.length > 1 && (
            <div className="flex gap-1.5 p-3 border-b overflow-x-auto shrink-0">
              {imgs.map((url, i) => (
                <button key={i} onClick={() => setImgIdx(i)}
                  className={cn('w-12 h-12 rounded-md border-2 overflow-hidden shrink-0 transition-colors',
                    i === imgIdx ? 'border-primary' : 'border-border hover:border-muted-foreground')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Identity */}
          <div className="px-4 py-3 border-b">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs text-muted-foreground">{product.code}</span>
                  {product.status === 'active' && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">판매중</span>
                  )}
                </div>
                <h2 className="text-base font-bold leading-snug">{product.nameKo}</h2>
                {product.nameEn && <p className="text-sm text-muted-foreground mt-0.5">{product.nameEn}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {product.category && <Badge variant="secondary" className="text-xs">{product.category}</Badge>}
                  {product.supplierName && <span className="text-xs text-muted-foreground">{product.supplierName}</span>}
                  {ex.maker && <span className="text-xs text-muted-foreground">제조: {ex.maker}</span>}
                </div>
              </div>

              {/* Price summary */}
              <div className="text-right shrink-0">
                {product.purchasePrice ? (
                  <>
                    <p className="text-xl font-bold text-primary">{product.currency} {usd.toFixed(2)}</p>
                    {krwPrice && <p className="text-sm text-muted-foreground">₩{krwPrice.toLocaleString()}</p>}
                    {trendPct !== null && (
                      <div className={cn('flex items-center justify-end gap-0.5 text-xs mt-0.5',
                        trendPct > 0 ? 'text-red-600' : trendPct < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                        {trendPct > 0 ? <TrendingUp className="w-3 h-3" /> : trendPct < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        {trendPct > 0 ? '+' : ''}{trendPct.toFixed(1)}%
                      </div>
                    )}
                  </>
                ) : <p className="text-sm text-muted-foreground">가격 미정</p>}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b shrink-0">
            {(['info', 'spec', 'price'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('flex-1 py-2.5 text-sm font-medium transition-colors border-b-2',
                  tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {t === 'info' ? '기본정보' : t === 'spec' ? '사양' : '가격/이력'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4">

            {/* ── 기본정보 ── */}
            {tab === 'info' && (
              <div className="space-y-2.5">
                {[
                  ['품번 (Code)', product.code],
                  ['제품명 (한글)', product.nameKo],
                  ['제품명 (영문)', product.nameEn],
                  ['카테고리', product.category],
                  ['공급업체', product.supplierName],
                  ['제조사', ex.maker],
                  ['원산지', product.countryOfOrigin],
                  ['HS Code', product.hsCode],
                  ['MOQ', product.moq ? `${product.moq.toLocaleString()} pcs` : undefined],
                  ['리드타임', product.leadTimeDays ? `${product.leadTimeDays}일` : undefined],
                  ['상세설명', ex.detail],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={String(k)} className="flex gap-3 py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground w-28 shrink-0 pt-px">{k}</span>
                    <span className="text-sm flex-1">{String(v)}</span>
                  </div>
                ))}
                {![product.nameEn, product.category, product.supplierName, ex.maker, product.countryOfOrigin].some(Boolean) && (
                  <p className="text-sm text-muted-foreground text-center py-6">기본 정보를 수정하여 채워주세요.</p>
                )}
              </div>
            )}

            {/* ── 사양 ── */}
            {tab === 'spec' && (
              <div>
                {specRows.length > 0 ? (
                  <div className="space-y-0">
                    {specRows.map(([k, v]) => (
                      <div key={String(k)} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                        <span className="text-xs text-muted-foreground w-32 shrink-0">{k}</span>
                        <span className="text-sm font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <Box className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">등록된 사양이 없습니다.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">수정 버튼을 눌러 사양을 입력하세요.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── 가격/이력 ── */}
            {tab === 'price' && (
              <div className="space-y-5">

                {/* Currency cards */}
                {product.purchasePrice ? (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">현재 환율 기준 가격</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl p-3 text-center bg-blue-50 border border-blue-100">
                        <p className="text-[10px] font-bold text-blue-500 mb-1">USD</p>
                        <p className="text-base font-bold text-blue-700">${usd.toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl p-3 text-center bg-emerald-50 border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-500 mb-1">KRW</p>
                        <p className="text-base font-bold text-emerald-700">
                          {krwPrice ? `₩${krwPrice.toLocaleString()}` : '-'}
                        </p>
                      </div>
                      <div className="rounded-xl p-3 text-center bg-red-50 border border-red-100">
                        <p className="text-[10px] font-bold text-red-500 mb-1">CNY</p>
                        <p className="text-base font-bold text-red-700">
                          {cnyPrice ? `¥${cnyPrice}` : '-'}
                        </p>
                      </div>
                    </div>
                    {rates && (
                      <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5" />
                        1 USD = ₩{rates.KRW.toFixed(0)} · ¥{rates.CNY.toFixed(2)}
                        {rates.updatedAt && <span className="opacity-60"> · {rates.updatedAt.slice(0, 16)}</span>}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">가격 정보 없음</p>
                )}

                {/* Trend sparkline (purchase) */}
                {prices.length >= 2 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">구매가 추세</p>
                    <div className="flex items-center gap-4 p-3 rounded-xl bg-blue-50/50">
                      <Sparkline values={prices} w={100} h={40} />
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-2"><span className="text-muted-foreground w-8">최저</span><span className="font-semibold text-green-600">{product.currency} {minP.toFixed(2)}</span></div>
                        <div className="flex items-center gap-2"><span className="text-muted-foreground w-8">최고</span><span className="font-semibold text-red-600">{product.currency} {maxP.toFixed(2)}</span></div>
                        <div className="flex items-center gap-2"><span className="text-muted-foreground w-8">현재</span><span className="font-semibold">{product.currency} {latestP.toFixed(2)}</span></div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Trend sparkline (sell) */}
                {sellPrices.length >= 2 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">판가 추세</p>
                    <div className="flex items-center gap-4 p-3 rounded-xl bg-emerald-50/50">
                      <Sparkline values={sellPrices} w={100} h={40} />
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-2"><span className="text-muted-foreground w-8">최저</span><span className="font-semibold text-green-600">{product.currency} {Math.min(...sellPrices).toFixed(2)}</span></div>
                        <div className="flex items-center gap-2"><span className="text-muted-foreground w-8">최고</span><span className="font-semibold text-red-600">{product.currency} {Math.max(...sellPrices).toFixed(2)}</span></div>
                        <div className="flex items-center gap-2"><span className="text-muted-foreground w-8">현재</span><span className="font-semibold">{product.currency} {sellPrices[sellPrices.length - 1].toFixed(2)}</span></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Purchase price history */}
                <div>
                  <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> 구매가 이력 ({priceHistory.length}건)
                  </p>
                  {priceHistory.length > 0 ? (
                    <div className="space-y-0 border rounded-lg overflow-hidden">
                      {priceHistory.slice().reverse().slice(0, 10).map((h: any, i: number) => {
                        const idx = priceHistory.length - 1 - i;
                        const prev = priceHistory[idx - 1];
                        const diff = prev ? h.price - prev.price : 0;
                        return (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-border/40 last:border-0 bg-blue-50/30">
                            <span className="text-xs text-muted-foreground w-22 shrink-0">{h.date?.slice(0, 10)}</span>
                            <span className="text-xs text-muted-foreground truncate flex-1">{h.company}</span>
                            <span className="text-sm font-semibold text-blue-700">{product.currency} {h.price.toFixed(2)}</span>
                            {diff !== 0 && (
                              <span className={cn('text-[10px]', diff > 0 ? 'text-red-500' : 'text-green-600')}>
                                {diff > 0 ? '▲' : '▼'}{Math.abs(diff).toFixed(2)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">발주 이력 없음</p>
                  )}
                </div>

                {/* Selling price history */}
                <div>
                  <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> 견적(판가) 이력 ({sellHistory.length}건)
                  </p>
                  {sellHistory.length > 0 ? (
                    <div className="space-y-0 border rounded-lg overflow-hidden">
                      {sellHistory.slice().reverse().slice(0, 10).map((h: any, i: number) => {
                        const idx = sellHistory.length - 1 - i;
                        const prev = sellHistory[idx - 1];
                        const diff = prev ? h.price - prev.price : 0;
                        return (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-border/40 last:border-0 bg-emerald-50/30">
                            <span className="text-xs text-muted-foreground w-22 shrink-0">{h.date?.slice(0, 10)}</span>
                            <span className="text-xs text-muted-foreground truncate flex-1">{h.company}</span>
                            <span className="text-sm font-semibold text-emerald-700">{product.currency} {h.price.toFixed(2)}</span>
                            {diff !== 0 && (
                              <span className={cn('text-[10px]', diff > 0 ? 'text-red-500' : 'text-green-600')}>
                                {diff > 0 ? '▲' : '▼'}{Math.abs(diff).toFixed(2)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">견적 이력 없음</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Multi-image grid ───────────────────────────────────────────────────── */

interface ImageGridProps {
  images: string[];
  productId: string;
  onChange: (images: string[]) => void;
  disabled?: boolean;
}

function ImageGrid({ images, productId, onChange, disabled }: ImageGridProps) {
  const [uploading, setUploading] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<number>(0);

  const uploadFile = useCallback(async (file: File, slotIdx: number) => {
    if (!file) return;
    setUploading(slotIdx);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/products/${productId}/upload`, { method: 'POST', body: fd });
      const j = await res.json();
      if (j.url) onChange([...images, j.url]);
      else alert(j.error || '업로드 실패');
    } catch { alert('업로드 중 오류가 발생했습니다.'); }
    finally { setUploading(null); }
  }, [images, productId, onChange]);

  const removeImage = (idx: number) => onChange(images.filter((_, i) => i !== idx));
  const emptySlots = Math.max(MIN_IMAGE_SLOTS - images.length, 1);
  const slots = [
    ...images.map((url, i) => ({ type: 'image' as const, url, idx: i })),
    ...Array.from({ length: emptySlots }, (_, i) => ({ type: 'empty' as const, idx: images.length + i })),
  ];

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {slots.map(slot => {
          if (slot.type === 'image') {
            return (
              <div key={slot.idx} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted/30 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slot.url} alt="" className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }} />
                {!disabled && (
                  <button type="button" onClick={() => removeImage(slot.idx)}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                )}
                <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[9px] px-1 rounded">{slot.idx + 1}</div>
              </div>
            );
          }
          const isFirst = slot.idx === images.length;
          return (
            <div key={slot.idx}
              onClick={() => { if (disabled) return; pendingSlot.current = slot.idx; inputRef.current?.click(); }}
              onDrop={e => { e.preventDefault(); setDragOverIdx(null); if (!disabled) { const f = e.dataTransfer.files[0]; if (f) uploadFile(f, slot.idx); } }}
              onDragOver={e => { e.preventDefault(); setDragOverIdx(slot.idx); }}
              onDragLeave={() => setDragOverIdx(null)}
              className={cn(
                'aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors',
                dragOverIdx === slot.idx ? 'border-primary bg-primary/5'
                  : isFirst ? 'border-primary/40 hover:border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/40',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {uploading === slot.idx ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className={cn('w-4 h-4 mb-1', isFirst ? 'text-primary' : 'text-muted-foreground/40')} />
                  <span className={cn('text-[9px]', isFirst ? 'text-primary' : 'text-muted-foreground/40')}>
                    {isFirst ? '업로드' : `+${slot.idx - images.length + 1}`}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5">클릭 또는 드래그&드롭 · JPG, PNG, WEBP · 최대 30MB · {images.length}개 등록됨</p>
      <input ref={inputRef} type="file" hidden accept="image/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, pendingSlot.current); e.target.value = ''; }} />
    </div>
  );
}

/* ─── Product Modal (Edit/Create) ────────────────────────────────────────── */

function ProductModal({ item, preId, products: allProducts, onClose, onSave }: { item?: Product | null; preId: string; products: Product[]; onClose: () => void; onSave: () => void }) {
  const ex = item as any;
  const productId = item?.id || preId;
  const [images, setImages] = useState<string[]>(() => {
    if (ex?.images?.length) return ex.images;
    if (ex?.imageUrl) return [ex.imageUrl];
    return [];
  });
  const [dupErr, setDupErr] = useState('');
  const [form, setForm] = useState({
    code: item?.code || '',
    nameKo: item?.nameKo || '',
    nameEn: item?.nameEn || '',
    category: item?.category || '',
    supplierName: item?.supplierName || '',
    maker: ex?.maker || '',
    purchasePrice: item?.purchasePrice?.toString() || '',
    sellingPrice: item?.sellingPrice?.toString() || '',
    currency: item?.currency || 'USD',
    moq: item?.moq?.toString() || '',
    leadTimeDays: item?.leadTimeDays?.toString() || '',
    hsCode: item?.hsCode || '',
    countryOfOrigin: item?.countryOfOrigin || '중국',
    detail: ex?.detail || '',
    voltage: ex?.voltage || '',
    watts: ex?.watts || '',
    cct: ex?.cct || '',
    inputA: ex?.inputA || '',
    outputV: ex?.outputV || '',
    outputA: ex?.outputA || '',
    material: ex?.material || '',
    sizeSpec: ex?.sizeSpec || '',
    converter: ex?.converter || '',
  });
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    fetch('/api/companies').then(r => r.json()).then(d => { if (d.data) setCompanies(d.data); }).catch(() => {});
  }, []);
  const suppliers = companies.filter(c => c.type === '공급업체');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameKo) return;

    // 중복 검사
    const dup = allProducts.find(p =>
      p.id !== item?.id && (
        (form.nameKo && p.nameKo === form.nameKo) ||
        (form.nameEn && form.nameEn.trim() && p.nameEn === form.nameEn.trim())
      )
    );
    if (dup) {
      setDupErr(`이미 등록된 제품명입니다. (${dup.code} - ${dup.nameKo})`);
      return;
    }
    setDupErr('');

    // 품번 자동 생성
    let code = form.code.trim();
    if (!code) {
      const nums = allProducts
        .map(p => { const m = p.code?.match(/^P-(\d+)$/); return m ? parseInt(m[1]) : 0; })
        .filter(n => n > 0);
      const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      code = `P-${String(next).padStart(4, '0')}`;
    }

    setSaving(true);
    try {
      const body = {
        ...form, code, images,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
        moq: form.moq ? Number(form.moq) : undefined,
        leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : undefined,
      };
      if (item) await fetch(`/api/products/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      else await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, preId }) });
      onSave();
    } finally { setSaving(false); }
  };

  const f = (label: string, key: keyof typeof form, placeholder: string, opts?: { required?: boolean; type?: string }) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}{opts?.required ? ' *' : ''}</label>
      <Input type={opts?.type || 'text'} value={form[key]} onChange={e => { setForm(p => ({ ...p, [key]: e.target.value })); if (key === 'nameKo' || key === 'nameEn') setDupErr(''); }} placeholder={placeholder} required={opts?.required} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <h2 className="font-semibold">{item ? '제품 수정' : '제품 등록'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }} className="p-4 space-y-5">

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">제품 이미지</p>
            <ImageGrid images={images} productId={productId} onChange={setImages} />
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">기본 정보</p>
            {dupErr && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-md">{dupErr}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">품번 <span className="text-muted-foreground/60">(미입력 시 자동생성)</span></label>
                <Input value={form.code} onChange={e => { setForm(p => ({ ...p, code: e.target.value })); setDupErr(''); }} placeholder="자동생성 (P-0001)" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">카테고리</label>
                <Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="조명, 태양광..." list="cat-list" />
                <datalist id="cat-list">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <ProductNameField
              value={form.nameKo}
              onChange={v => { setForm(p => ({ ...p, nameKo: v })); setDupErr(''); }}
              allProducts={allProducts}
              currentId={item?.id}
            />
            {f('제품명 (영문)', 'nameEn', 'LED Panel 40W')}
            <div className="grid grid-cols-2 gap-3">
              <CompanyAutocomplete label="공급업체" value={form.supplierName} onChange={v => setForm(p => ({ ...p, supplierName: v }))} companies={suppliers} />
              <CompanyAutocomplete label="제조사" value={form.maker} onChange={v => setForm(p => ({ ...p, maker: v }))} companies={suppliers} />
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">사양 (Spec)</p>
            {f('상세 사양', 'detail', '1200x600mm, IP44, IK08')}
            <div className="grid grid-cols-3 gap-2">
              {f('전압', 'voltage', '220V')}
              {f('와트', 'watts', '40W')}
              {f('CCT', 'cct', '4000K')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {f('InputA', 'inputA', '0.18A')}
              {f('OutputV', 'outputV', '24V')}
              {f('OutputA', 'outputA', '1.67A')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {f('재질', 'material', '알루미늄')}
              {f('크기', 'sizeSpec', '1200×600mm')}
              {f('컨버터', 'converter', '내장')}
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">가격 / 거래</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">{f('구매단가', 'purchasePrice', '17.50', { type: 'number' })}</div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
                <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option>USD</option><option>EUR</option><option>CNY</option><option>KRW</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {f('판매단가 (KRW)', 'sellingPrice', '32000', { type: 'number' })}
              {f('MOQ', 'moq', '200', { type: 'number' })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {f('리드타임(일)', 'leadTimeDays', '45', { type: 'number' })}
              {f('원산지', 'countryOfOrigin', '중국')}
            </div>
            {f('HS Code', 'hsCode', '9405.10')}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving || !!allProducts.find(p => p.id !== item?.id && p.nameKo === form.nameKo.trim())}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정' : '저장')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Products Page ──────────────────────────────────────────────────────── */

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('전체');
  const [modal, setModal] = useState<{ open: boolean; item?: Product | null; preId: string }>({ open: false, preId: '' });
  const [drawer, setDrawer] = useState<Product | null>(null);
  const [adminModal, setAdminModal] = useState<{ open: boolean; action: () => void }>({ open: false, action: () => {} });
  const [syncing, setSyncing] = useState(false);
  const rates = useExchangeRates();

  const load = async () => {
    setLoading(true);
    const [prodRes, poRes, quoteRes] = await Promise.all([
      fetch('/api/products').then(r => r.json()),
      fetch('/api/purchase-orders').then(r => r.json()),
      fetch('/api/quotes').then(r => r.json()),
    ]);
    if (prodRes.data) setProducts(prodRes.data);
    if (poRes.data) setPos(poRes.data);
    if (quoteRes.data) setQuotes(quoteRes.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // AI 도우미가 답변에 붙인 출처 링크(?open=id)로 들어오면 해당 제품 상세를 자동으로 연다.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || products.length === 0) return;
    const target = products.find(p => p.businessId === openId);
    if (target) setDrawer(target);
  }, [searchParams, products]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/products/sync', { method: 'POST' });
      const j = await res.json();
      alert(`동기화 완료: ${j.synced}개 제품 업데이트`);
      load();
    } catch { alert('동기화 실패'); }
    finally { setSyncing(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('제품을 삭제하시겠습니까?')) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    load();
    if (drawer?.id === id) setDrawer(null);
  };

  const openModal = (item?: Product | null) => {
    const preId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    setModal({ open: true, item, preId });
  };
  const guardEdit = (item: Product, action: () => void) => {
    if (isPrevMonth(item.createdAt)) setAdminModal({ open: true, action });
    else action();
  };

  // Categories from loaded products
  const allCats = ['전체', ...Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[])).sort()];

  const searchQ = search.toLowerCase();
  const filtered = products.filter(p => {
    const ms = p.nameKo.toLowerCase().includes(searchQ) || (p.nameEn ?? '').toLowerCase().includes(searchQ) || p.code.toLowerCase().includes(searchQ) || ((p as any).maker ?? '').toLowerCase().includes(searchQ) || (p.supplierName ?? '').toLowerCase().includes(searchQ);
    const mc = catFilter === '전체' || p.category === catFilter;
    return ms && mc;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="제품" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">

        {/* Search + action bar */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="제품명, 품번, 제조사, 공급업체 검색..." className="pl-9 h-10 text-sm" value={search} onChange={e => { setSearch(e.target.value); setCatFilter('전체'); }} />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground self-center whitespace-nowrap hidden sm:block">{filtered.length} / {products.length}개</span>
          <Button size="sm" variant="outline" className="h-10 gap-1 shrink-0" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="hidden sm:inline">노션 동기화</span>
          </Button>
          <Button size="sm" className="h-10 gap-1 shrink-0" onClick={() => openModal(null)}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">제품 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* ── Desktop rich list ── */}
            <div className="hidden md:block rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground w-14">사진</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">제품 정보</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden lg:table-cell">사양</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden lg:table-cell">공급업체</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">단가</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground w-20">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(p => {
                    const ex = p as any;
                    const imgs: string[] = ex.images?.length ? ex.images : ex.imageUrl ? [ex.imageUrl] : [];
                    return (
                      <tr key={p.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setDrawer(p)}>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <div className="w-10 h-10 rounded-lg border border-border overflow-hidden bg-muted/30 flex items-center justify-center shrink-0 relative">
                            {imgs[0] ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={imgs[0]} alt="" className="w-full h-full object-cover"
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-muted-foreground/30" />
                            )}
                            {imgs.length > 1 && (
                              <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                                {imgs.length}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-muted-foreground">{p.code}</span>
                                {p.category && <Badge variant="outline" className="text-[9px] h-4 px-1 py-0">{p.category}</Badge>}
                              </div>
                              <p className="font-semibold text-sm leading-snug mt-0.5">{p.nameKo}</p>
                              {p.nameEn && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.nameEn}</p>}
                              {ex.maker && <p className="text-[10px] text-muted-foreground/60">{ex.maker}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          <SpecTags product={p} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                          <span className="block truncate max-w-[120px]">{p.supplierName ?? '-'}</span>
                        </td>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <PriceCell price={p.purchasePrice} currency={p.currency} rates={rates} />
                        </td>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => guardEdit(p, () => openModal(p))}>
                              {isPrevMonth(p.createdAt) && <Lock className="w-3 h-3 text-orange-400 mr-0.5" />}<Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => guardEdit(p, () => handleDelete(p.id))}>
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
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />제품이 없습니다.
                </div>
              )}
            </div>

            {/* ── Mobile 2-col grid ── */}
            <div className="md:hidden grid grid-cols-2 gap-3">
              {filtered.map(p => {
                const ex = p as any;
                const imgs: string[] = ex.images?.length ? ex.images : ex.imageUrl ? [ex.imageUrl] : [];
                const usd = Number(p.purchasePrice || 0);
                const krw = usd && rates ? Math.round(usd * rates.KRW) : null;
                return (
                  <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                    onClick={() => setDrawer(p)}>
                    <div className="aspect-square bg-muted/30 relative">
                      {imgs[0] ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={imgs[0]} alt={p.nameKo} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-10 h-10 text-muted-foreground/20" />
                        </div>
                      )}
                      {imgs.length > 1 && (
                        <div className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-full">{imgs.length}장</div>
                      )}
                      <div className="absolute bottom-1.5 right-1.5 flex gap-1" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => guardEdit(p, () => openModal(p))} className="bg-white/90 rounded-full p-1 shadow"><Pencil className="w-3 h-3 text-gray-700" /></button>
                        <button type="button" onClick={() => guardEdit(p, () => handleDelete(p.id))} className="bg-white/90 rounded-full p-1 shadow"><Trash2 className="w-3 h-3 text-red-500" /></button>
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="text-[10px] font-mono text-muted-foreground">{p.code}</p>
                      <p className="font-semibold text-sm mt-0.5 line-clamp-2 leading-snug">{p.nameKo}</p>
                      {p.category && <Badge variant="secondary" className="text-[9px] mt-1 h-4 px-1">{p.category}</Badge>}
                      {usd > 0 && (
                        <div className="mt-1.5">
                          <p className="text-xs font-bold">{p.currency} {usd.toFixed(2)}</p>
                          {krw && <p className="text-[10px] text-muted-foreground">₩{krw.toLocaleString()}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="col-span-2 py-12 text-center text-sm text-muted-foreground">제품이 없습니다.</div>}
            </div>
          </>
        )}
      </div>

      {/* Edit/Create modal */}
      {modal.open && (
        <ProductModal
          item={modal.item}
          preId={modal.preId}
          products={products}
          onClose={() => setModal({ open: false, preId: '' })}
          onSave={() => { setModal({ open: false, preId: '' }); load(); }}
        />
      )}

      {adminModal.open && (
        <AdminPasswordModal
          onConfirm={() => { setAdminModal({ open: false, action: () => {} }); adminModal.action(); }}
          onCancel={() => setAdminModal({ open: false, action: () => {} })}
        />
      )}

      {/* Detail drawer */}
      {drawer && (
        <ProductDrawer
          product={drawer}
          rates={rates}
          pos={pos}
          quotes={quotes}
          onClose={() => setDrawer(null)}
          onEdit={() => { setDrawer(null); guardEdit(drawer, () => openModal(drawer)); }}
          onDelete={() => { guardEdit(drawer, () => handleDelete(drawer.id)); }}
        />
      )}
    </div>
  );
}

export default function ProductsPage() {
  return <Suspense><ProductsPageInner /></Suspense>;
}
