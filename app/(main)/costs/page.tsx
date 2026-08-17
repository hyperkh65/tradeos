'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus, X, FileText, Download, Check, AlertCircle, Clock, ChevronDown, Printer, Search, Trash2 } from 'lucide-react';
import type { CostRecord, OffsetItem } from '@/app/api/cost-records/route';
import type { ForeignInvoice, ForeignInvoiceItem } from '@/app/api/foreign-invoices/route';

// ── 상수 ────────────────────────────────────────────────────────────────────

const COST_TYPE_LABELS: Record<string, string> = {
  duty: '관세', vat: '수입부가세', customs_broker: '관세사비',
  inspection: '세관검사비', warehouse: '창고료(장치료)',
  demurrage: '체화료(DEM)', detention: '지체료(DET)',
  inland_freight: '내륙운송비', ocean_freight: '해상운임',
  air_freight: '항공운임', certification: '인증비', other: '기타',
};

const DISPOSITION_LABELS: Record<string, { label: string; color: string }> = {
  pending:            { label: '미결정',    color: 'bg-gray-100 text-gray-600' },
  internal:           { label: '내부비용',  color: 'bg-slate-100 text-slate-700' },
  billable_domestic:  { label: '국내 매출', color: 'bg-blue-100 text-blue-700' },
  billable_foreign:   { label: '외화 청구', color: 'bg-green-100 text-green-700' },
  offset_purchase:    { label: '매입 상계', color: 'bg-purple-100 text-purple-700' },
};

const BILL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  unbilled:  { label: '미청구',   color: 'text-gray-500' },
  invoiced:  { label: '청구완료', color: 'text-blue-600' },
  collected: { label: '수금완료', color: 'text-green-600' },
  offset:    { label: '상계완료', color: 'text-purple-600' },
  waived:    { label: '면제',     color: 'text-gray-400' },
};

const CAUSE_TYPE_LABELS: Record<string, string> = {
  schedule: '일정', client_fault: '고객귀책', our_fault: '당사귀책',
  force_majeure: '불가항력', port_congestion: '항구혼잡',
};

const CURRENCIES = ['KRW', 'USD', 'CNY', 'EUR', 'JPY'];
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';
const inputCls = 'w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

// ── Autocomplete 입력 컴포넌트 ──────────────────────────────────────────────

interface AcOption { label: string; sub?: string; value: string; id?: string }

function AcInput({
  value, onChange, options, placeholder, onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  options: AcOption[];
  placeholder?: string;
  onSelect?: (opt: AcOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(value.toLowerCase()) ||
        o.value.toLowerCase().includes(value.toLowerCase()) ||
        (o.sub || '').toLowerCase().includes(value.toLowerCase())
      ).slice(0, 10)
    : options.slice(0, 10);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="h-9"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-0.5 left-0 right-0 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(opt => (
            <button key={opt.value} type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted"
              onMouseDown={e => {
                e.preventDefault();
                onChange(opt.label);
                onSelect?.(opt);
                setOpen(false);
              }}>
              <div className="font-medium">{opt.label}</div>
              {opt.sub && <div className="text-muted-foreground text-[10px]">{opt.sub}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 비용 상세/편집 모달 ────────────────────────────────────────────────────

interface RefData {
  shipments: { id: string; businessId: string; blNo?: string; eta?: string; status?: string }[];
  imports: { id: string; businessId: string; declarationNo?: string; etd?: string }[];
  companies: { id: string; name: string; type?: string }[];
  purchaseOrders: { id: string; businessId: string; supplierName: string; totalAmount?: number; currency?: string; items?: unknown[] }[];
  sales: { id: string; businessId: string; customer?: string; totalAmount?: number; saleDate?: string }[];
}

function CostModal({
  record, onClose, onSave,
}: { record: CostRecord | null; onClose: () => void; onSave: () => void }) {
  const isNew = !record;
  const [ref, setRef] = useState<RefData>({ shipments: [], imports: [], companies: [], purchaseOrders: [], sales: [] });
  const [form, setForm] = useState({
    costType: record?.costType || 'other',
    description: record?.description || '',
    costAmount: record?.costAmount?.toString() || '',
    costCurrency: record?.costCurrency || 'KRW',
    fxRateAtCost: record?.fxRateAtCost?.toString() || '1',
    incurredDate: record?.incurredDate || new Date().toISOString().slice(0, 10),
    disposition: record?.disposition || 'pending',
    billAmount: record?.billAmount?.toString() || '',
    billCurrency: record?.billCurrency || 'KRW',
    billStatus: record?.billStatus || 'unbilled',
    causeType: record?.causeType || 'schedule',
    offsetStatus: record?.offsetStatus || 'none',
    offsetRemaining: record?.offsetRemaining?.toString() || '',
    fxRateAtSettle: record?.fxRateAtSettle?.toString() || '',
    settledAt: record?.settledAt || '',
    remark: record?.remark || '',
    clientName: record?.clientName || '',
    clientId: record?.clientId || '',
    companyId: record?.companyId || '',
    importBusinessId: record?.importBusinessId || '',
    importId: record?.importId || '',
    shipmentBusinessId: record?.shipmentBusinessId || '',
    shipmentId: record?.shipmentId || '',
    linkedSaleId: record?.linkedSaleId || '',
    linkedSaleLabel: '',
  });
  const [offsetItems, setOffsetItems] = useState<OffsetItem[]>(record?.offsetItems || []);
  const [poSearchText, setPoSearchText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/shipments').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/imports').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/companies').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/purchase-orders').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/sales').then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([sh, im, co, po, sa]) => {
      setRef({
        shipments: (sh.data || []).map((s: Record<string, unknown>) => ({ id: s.id as string, businessId: s.businessId as string, blNo: s.blNo as string, eta: s.eta as string, status: s.status as string })),
        imports: (im.data || []).map((i: Record<string, unknown>) => ({ id: i.id as string, businessId: i.businessId as string, declarationNo: i.declarationNo as string })),
        companies: (co.data || []).map((c: Record<string, unknown>) => ({ id: c.id as string, name: c.name as string, type: c.type as string })),
        purchaseOrders: (po.data || []).map((p: Record<string, unknown>) => ({ id: p.id as string, businessId: p.businessId as string, supplierName: p.supplierName as string, totalAmount: p.totalAmount as number, currency: p.currency as string, items: p.items as unknown[] })),
        sales: (sa.data || []).map((s: Record<string, unknown>) => ({ id: s.id as string, businessId: s.businessId as string, customer: s.customer as string, totalAmount: s.totalAmount as number, saleDate: s.saleDate as string })),
      });
      // 기존 매출 연결 레이블 세팅
      if (record?.linkedSaleId) {
        const found = sa.data?.find((s: Record<string, unknown>) => s.id === record.linkedSaleId);
        if (found) setForm(f => ({ ...f, linkedSaleLabel: `${found.businessId} · ${found.customer}` }));
      }
    });
  }, []);

  const costKrw = form.costCurrency === 'KRW'
    ? parseFloat(form.costAmount || '0')
    : parseFloat(form.costAmount || '0') * parseFloat(form.fxRateAtCost || '1');

  const billFinal = parseFloat(form.billAmount || form.costAmount || '0');
  const margin = billFinal - parseFloat(form.costAmount || '0');

  const offsetTotal = offsetItems.reduce((s, i) => s + (i.amount || 0), 0);

  const addOffsetPo = (po: RefData['purchaseOrders'][0]) => {
    if (offsetItems.find(i => i.poId === po.id)) return;
    setOffsetItems(prev => [...prev, {
      poId: po.id,
      poBusinessId: po.businessId,
      supplierName: po.supplierName,
      description: '',
      qty: 1,
      amount: 0,
      currency: po.currency || 'KRW',
    }]);
    setPoSearchText('');
  };

  const updateOffsetItem = (idx: number, field: keyof OffsetItem, value: string | number) => {
    setOffsetItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeOffsetItem = (idx: number) => {
    setOffsetItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!form.costAmount) { alert('원가금액을 입력하세요.'); return; }
    setSaving(true);
    try {
      const body = {
        costType: form.costType,
        description: form.description || undefined,
        costAmount: parseFloat(form.costAmount),
        costCurrency: form.costCurrency,
        fxRateAtCost: parseFloat(form.fxRateAtCost || '1'),
        incurredDate: form.incurredDate,
        disposition: form.disposition,
        billAmount: form.billAmount ? parseFloat(form.billAmount) : undefined,
        billCurrency: form.billCurrency,
        billStatus: form.billStatus,
        causeType: form.causeType,
        offsetStatus: form.offsetStatus,
        offsetRemaining: form.offsetRemaining ? parseFloat(form.offsetRemaining) : undefined,
        offsetItems: form.disposition === 'offset_purchase' ? offsetItems : [],
        fxRateAtSettle: form.fxRateAtSettle ? parseFloat(form.fxRateAtSettle) : undefined,
        settledAt: form.settledAt || undefined,
        remark: form.remark || undefined,
        clientName: form.clientName || undefined,
        clientId: form.clientId || undefined,
        companyId: form.companyId || undefined,
        importBusinessId: form.importBusinessId || undefined,
        importId: form.importId || undefined,
        shipmentBusinessId: form.shipmentBusinessId || undefined,
        shipmentId: form.shipmentId || undefined,
        linkedSaleId: form.linkedSaleId || undefined,
      };

      if (isNew) {
        const res = await fetch('/api/cost-records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('저장 실패');
      } else {
        const res = await fetch(`/api/cost-records/${record!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('저장 실패');
      }
      onSave();
    } catch (e) { alert(`오류: ${e}`); }
    finally { setSaving(false); }
  };

  const shipmentOptions: AcOption[] = ref.shipments.map(s => ({
    label: s.businessId,
    sub: [s.blNo, s.eta, s.status].filter(Boolean).join(' · '),
    value: s.businessId,
    id: s.id,
  }));

  const importOptions: AcOption[] = ref.imports.map(i => ({
    label: i.businessId,
    sub: i.declarationNo,
    value: i.businessId,
    id: i.id,
  }));

  const companyOptions: AcOption[] = ref.companies.map(c => ({
    label: c.name,
    sub: c.type,
    value: c.name,
    id: c.id,
  }));

  const salesOptions: AcOption[] = ref.sales.map(s => ({
    label: `${s.businessId} · ${s.customer || ''}`,
    sub: s.saleDate,
    value: s.id,
    id: s.id,
  }));

  const filteredPos = ref.purchaseOrders.filter(p =>
    p.businessId.toLowerCase().includes(poSearchText.toLowerCase()) ||
    p.supplierName.toLowerCase().includes(poSearchText.toLowerCase())
  ).slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="font-semibold text-sm">{isNew ? '비용 등록' : '비용 수정'}</h2>
          <div className="flex items-center gap-2">
            {!isNew && record?.disposition === 'internal' && (
              <button type="button"
                onClick={() => window.open(`/costs/expense-print?id=${record.id}`, '_blank')}
                className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50">
                <Printer className="w-3.5 h-3.5" />비용서 출력
              </button>
            )}
            <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {record?.isAutoAllocated && (
            <div className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              통관 입력 시 자동 생성된 비용입니다. 처리 방향만 변경 가능합니다.
            </div>
          )}

          {/* 비용 유형 + 설명 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>비용 유형</label>
              <select className={inputCls} value={form.costType} onChange={e => setForm(f => ({ ...f, costType: e.target.value }))}>
                {Object.entries(COST_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>발생일</label>
              <Input type="date" value={form.incurredDate} onChange={e => setForm(f => ({ ...f, incurredDate: e.target.value }))} className="h-9" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>설명</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="비용 설명" className="h-9" />
            </div>
          </div>

          {/* 원가 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold text-slate-700">원가 (실제 지출)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>금액</label>
                <Input type="number" value={form.costAmount} onChange={e => setForm(f => ({ ...f, costAmount: e.target.value }))} placeholder="0" className="h-9" />
              </div>
              <div>
                <label className={labelCls}>통화</label>
                <select className={inputCls} value={form.costCurrency} onChange={e => setForm(f => ({ ...f, costCurrency: e.target.value, billCurrency: e.target.value }))}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>환율 (발생 시)</label>
                <Input type="number" value={form.fxRateAtCost} onChange={e => setForm(f => ({ ...f, fxRateAtCost: e.target.value }))} placeholder="1" disabled={form.costCurrency === 'KRW'} className="h-9" />
              </div>
            </div>
            {form.costCurrency !== 'KRW' && costKrw > 0 && (
              <div className="text-xs text-slate-600">원화 환산: <span className="font-medium">{Math.round(costKrw).toLocaleString()}원</span></div>
            )}
          </div>

          {/* 연결 선적/통관/거래처 */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold text-sky-800">연결 정보</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>선적 연결 (SHP-)</label>
                <AcInput
                  value={form.shipmentBusinessId}
                  onChange={v => setForm(f => ({ ...f, shipmentBusinessId: v }))}
                  options={shipmentOptions}
                  placeholder="SHP-2026-0001"
                  onSelect={opt => setForm(f => ({ ...f, shipmentBusinessId: opt.label, shipmentId: opt.id || '' }))}
                />
              </div>
              <div>
                <label className={labelCls}>통관 연결 (IMP-)</label>
                <AcInput
                  value={form.importBusinessId}
                  onChange={v => setForm(f => ({ ...f, importBusinessId: v }))}
                  options={importOptions}
                  placeholder="IMP-2026-0001"
                  onSelect={opt => setForm(f => ({ ...f, importBusinessId: opt.label, importId: opt.id || '' }))}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>거래처 (업체명)</label>
                <AcInput
                  value={form.clientName}
                  onChange={v => setForm(f => ({ ...f, clientName: v, clientId: '' }))}
                  options={companyOptions}
                  placeholder="거래처명 입력 또는 검색"
                  onSelect={opt => setForm(f => ({ ...f, clientName: opt.label, clientId: opt.id || '', companyId: opt.id || '' }))}
                />
              </div>
            </div>
          </div>

          {/* 처리 방향 */}
          <div>
            <label className={labelCls}>처리 방향</label>
            <div className="grid grid-cols-5 gap-1.5">
              {Object.entries(DISPOSITION_LABELS).map(([k, { label, color }]) => (
                <button key={k} type="button"
                  onClick={() => setForm(f => ({ ...f, disposition: k as CostRecord['disposition'] }))}
                  className={cn('text-xs px-2 py-2 rounded-lg border transition-all text-center', form.disposition === k ? 'border-primary ring-1 ring-primary ' + color : 'border-border hover:bg-muted')}>
                  <span className={cn('block text-[10px] font-semibold', form.disposition === k ? '' : 'text-muted-foreground')}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 내부비용 */}
          {form.disposition === 'internal' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">내부 비용 처리</div>
              <p className="text-xs text-slate-500">외부 청구 없이 내부 비용으로 처리됩니다. 저장 후 '비용서 출력' 버튼으로 거래명세표를 출력할 수 있습니다.</p>
            </div>
          )}

          {/* 국내 매출 */}
          {form.disposition === 'billable_domestic' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
              <div className="text-xs font-semibold text-blue-800">국내 매출 청구</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>청구 금액</label>
                  <Input type="number" value={form.billAmount} onChange={e => setForm(f => ({ ...f, billAmount: e.target.value }))} placeholder={form.costAmount || '원가와 동일'} className="h-9" />
                </div>
                <div>
                  <label className={labelCls}>통화</label>
                  <select className={inputCls} value={form.billCurrency} onChange={e => setForm(f => ({ ...f, billCurrency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>청구 상태</label>
                  <select className={inputCls} value={form.billStatus} onChange={e => setForm(f => ({ ...f, billStatus: e.target.value as CostRecord['billStatus'] }))}>
                    {Object.entries(BILL_STATUS_LABELS).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </div>
              </div>
              {form.billAmount && parseFloat(form.billAmount) !== parseFloat(form.costAmount || '0') && (
                <div className={cn('text-xs font-medium', margin > 0 ? 'text-green-700' : 'text-red-600')}>
                  마진: {margin >= 0 ? '+' : ''}{margin.toLocaleString(undefined, { maximumFractionDigits: 2 })} {form.billCurrency}
                </div>
              )}
              <div>
                <label className={labelCls}>연결 매출 (매출관리 시트)</label>
                <AcInput
                  value={form.linkedSaleLabel}
                  onChange={v => setForm(f => ({ ...f, linkedSaleLabel: v }))}
                  options={salesOptions}
                  placeholder="매출 번호 검색 (연결 시 매출처리 인정)"
                  onSelect={opt => setForm(f => ({ ...f, linkedSaleId: opt.id || '', linkedSaleLabel: opt.label }))}
                />
                {form.linkedSaleId && (
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-green-700">
                    <Check className="w-3 h-3" />매출관리 연결됨 · <button type="button" className="text-red-500 hover:underline" onClick={() => setForm(f => ({ ...f, linkedSaleId: '', linkedSaleLabel: '' }))}>연결 해제</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 외화 청구 */}
          {form.disposition === 'billable_foreign' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
              <div className="text-xs font-semibold text-green-800">외화 청구</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>청구 금액</label>
                  <Input type="number" value={form.billAmount} onChange={e => setForm(f => ({ ...f, billAmount: e.target.value }))} placeholder={form.costAmount || '원가와 동일'} className="h-9" />
                </div>
                <div>
                  <label className={labelCls}>청구 통화</label>
                  <select className={inputCls} value={form.billCurrency} onChange={e => setForm(f => ({ ...f, billCurrency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>청구 상태</label>
                  <select className={inputCls} value={form.billStatus} onChange={e => setForm(f => ({ ...f, billStatus: e.target.value as CostRecord['billStatus'] }))}>
                    {Object.entries(BILL_STATUS_LABELS).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </div>
              </div>
              {form.billAmount && parseFloat(form.billAmount) !== parseFloat(form.costAmount || '0') && (
                <div className={cn('text-xs font-medium', margin > 0 ? 'text-green-700' : 'text-red-600')}>
                  마진: {margin >= 0 ? '+' : ''}{margin.toLocaleString(undefined, { maximumFractionDigits: 2 })} {form.billCurrency}
                </div>
              )}
              <p className="text-xs text-green-700">저장 후 '외화 인보이스' 탭에서 인보이스를 생성하세요.</p>
            </div>
          )}

          {/* 매입 상계 */}
          {form.disposition === 'offset_purchase' && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-3">
              <div className="text-xs font-semibold text-purple-800">매입 상계</div>

              {/* PO 검색 + 추가 */}
              <div>
                <label className={labelCls}>발주서(PO) 검색 후 추가</label>
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={poSearchText}
                        onChange={e => setPoSearchText(e.target.value)}
                        placeholder="PO번호 또는 공급업체명 검색"
                        className="h-9 pl-8 text-xs"
                      />
                    </div>
                  </div>
                  {poSearchText && filteredPos.length > 0 && (
                    <div className="absolute z-50 mt-0.5 left-0 right-0 bg-background border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {filteredPos.map(po => (
                        <button key={po.id} type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between"
                          onClick={() => addOffsetPo(po)}>
                          <div>
                            <div className="font-medium">{po.businessId}</div>
                            <div className="text-muted-foreground">{po.supplierName}</div>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <div>{po.totalAmount?.toLocaleString()} {po.currency}</div>
                            <div className="text-[10px] text-muted-foreground">{(po.items as { productName?: string }[])?.[0]?.productName || ''}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 추가된 PO 목록 */}
              {offsetItems.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold text-muted-foreground px-1">
                    <div className="col-span-3">PO번호 / 업체</div>
                    <div className="col-span-3">내용 (항목)</div>
                    <div className="col-span-2">수량</div>
                    <div className="col-span-3">상계금액</div>
                    <div className="col-span-1"></div>
                  </div>
                  {offsetItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1 items-center bg-white border border-purple-100 rounded-lg p-2">
                      <div className="col-span-3">
                        <div className="text-xs font-medium">{item.poBusinessId}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{item.supplierName}</div>
                      </div>
                      <div className="col-span-3">
                        <Input value={item.description} onChange={e => updateOffsetItem(idx, 'description', e.target.value)} placeholder="항목 내용" className="h-7 text-xs" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" value={item.qty} onChange={e => updateOffsetItem(idx, 'qty', parseFloat(e.target.value) || 0)} className="h-7 text-xs" />
                      </div>
                      <div className="col-span-3">
                        <div className="flex gap-1">
                          <Input type="number" value={item.amount} onChange={e => updateOffsetItem(idx, 'amount', parseFloat(e.target.value) || 0)} className="h-7 text-xs flex-1" />
                          <select className="h-7 border rounded text-xs px-1 shrink-0" value={item.currency} onChange={e => updateOffsetItem(idx, 'currency', e.target.value)}>
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button type="button" onClick={() => removeOffsetItem(idx)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-xs font-semibold px-1 pt-1 border-t">
                    <span>상계 합계</span>
                    <span className={cn(offsetTotal > parseFloat(form.costAmount || '0') ? 'text-red-600' : 'text-purple-700')}>
                      {offsetTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} / 원가 {parseFloat(form.costAmount || '0').toLocaleString()}
                      {offsetTotal === parseFloat(form.costAmount || '0') && <Check className="inline w-3.5 h-3.5 ml-1 text-green-600" />}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>상계 상태</label>
                  <select className={inputCls} value={form.offsetStatus} onChange={e => setForm(f => ({ ...f, offsetStatus: e.target.value as CostRecord['offsetStatus'] }))}>
                    <option value="none">해당없음</option>
                    <option value="pending">상계예정</option>
                    <option value="partial">부분상계</option>
                    <option value="completed">상계완료</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>미상계 잔액</label>
                  <Input type="number" value={form.offsetRemaining} onChange={e => setForm(f => ({ ...f, offsetRemaining: e.target.value }))} placeholder={form.costAmount} className="h-9" />
                </div>
              </div>
            </div>
          )}

          {/* FX 정산 (외화 청구 + 수금완료) */}
          {form.billStatus === 'collected' && form.billCurrency !== 'KRW' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-amber-800">환율 정산 (수금 시)</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>수금 시 환율</label>
                  <Input type="number" value={form.fxRateAtSettle} onChange={e => setForm(f => ({ ...f, fxRateAtSettle: e.target.value }))} placeholder="1385" className="h-9" />
                </div>
                <div>
                  <label className={labelCls}>수금일</label>
                  <Input type="date" value={form.settledAt} onChange={e => setForm(f => ({ ...f, settledAt: e.target.value }))} className="h-9" />
                </div>
              </div>
              {form.fxRateAtSettle && form.fxRateAtCost && form.billAmount && (
                (() => {
                  const origKrw = parseFloat(form.billAmount) * parseFloat(form.fxRateAtCost);
                  const settleKrw = parseFloat(form.billAmount) * parseFloat(form.fxRateAtSettle);
                  const diff = Math.round(settleKrw - origKrw);
                  return (
                    <div className={cn('text-xs font-medium', diff >= 0 ? 'text-green-700' : 'text-red-600')}>
                      환차{diff >= 0 ? '익' : '손'}: {diff >= 0 ? '+' : ''}{diff.toLocaleString()}원
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* DEM/DET 원인 */}
          {(form.costType === 'demurrage' || form.costType === 'detention') && (
            <div>
              <label className={labelCls}>비용 원인 (귀책)</label>
              <select className={inputCls} value={form.causeType} onChange={e => setForm(f => ({ ...f, causeType: e.target.value }))}>
                {Object.entries(CAUSE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>비고</label>
            <Input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} placeholder="메모" className="h-9" />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-3.5 border-t">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          {!isNew && !record?.isAutoAllocated && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10"
              onClick={async () => {
                if (!confirm('삭제하시겠습니까?')) return;
                await fetch(`/api/cost-records/${record!.id}`, { method: 'DELETE' });
                onSave();
              }}>삭제</Button>
          )}
          <Button type="button" className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : (isNew ? '등록' : '저장')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 외화 인보이스 생성 모달 ────────────────────────────────────────────────

function ForeignInvoiceModal({
  records, onClose, onSave,
}: { records: CostRecord[]; onClose: () => void; onSave: () => void }) {
  const billable = records.filter(r => r.disposition === 'billable_foreign' && r.billStatus === 'unbilled');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [clientName, setClientName] = useState(billable[0]?.clientName || '');
  const [clientId, setClientId] = useState(billable[0]?.clientId || '');
  const [currency, setCurrency] = useState('USD');
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  // 라인 아이템
  const [items, setItems] = useState<ForeignInvoiceItem[]>([
    { description: '', qty: 1, unit: 'lot', unitPrice: 0, vatIncluded: false, amount: 0, currency: 'USD' },
  ]);

  // 비용 레코드 선택 (인보이스 생성 시 연결)
  const [linkedCostIds, setLinkedCostIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/companies').then(r => r.json()).then(d => {
      setCompanies((d.data || []).map((c: Record<string, unknown>) => ({ id: c.id as string, name: c.name as string })));
    }).catch(() => {});

    // 선택된 미청구 비용이 있으면 라인 아이템에 미리 추가
    if (billable.length > 0) {
      const preItems: ForeignInvoiceItem[] = billable.map(r => ({
        costRecordId: r.id,
        description: r.description || COST_TYPE_LABELS[r.costType] || r.costType,
        qty: 1,
        unit: 'lot',
        unitPrice: r.billAmount || r.costAmount,
        vatIncluded: false,
        amount: r.billAmount || r.costAmount,
        currency: r.billCurrency || r.costCurrency,
      }));
      setItems(preItems);
      setLinkedCostIds(new Set(billable.map(r => r.id)));
    }
  }, []);

  const companyOptions: AcOption[] = companies.map(c => ({ label: c.name, value: c.name, id: c.id }));

  const updateItem = (idx: number, field: keyof ForeignInvoiceItem, value: string | number | boolean) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      // 금액 자동 계산 (qty × unitPrice)
      if (field === 'qty' || field === 'unitPrice') {
        updated.amount = Math.round((updated.qty || 0) * (updated.unitPrice || 0) * 100) / 100;
      }
      return updated;
    }));
  };

  const addItem = () => {
    setItems(prev => [...prev, { description: '', qty: 1, unit: 'lot', unitPrice: 0, vatIncluded: false, amount: 0, currency }]);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const vatTotal = items.reduce((s, i) => {
    if (!i.vatIncluded) return s;
    return s + Math.round((i.amount / 1.1) * 0.1 * 100) / 100;
  }, 0);
  const total = subtotal;

  const handleCreate = async () => {
    if (!clientName) { alert('거래처를 입력하세요.'); return; }
    if (items.length === 0 || items.every(i => !i.description)) { alert('내역을 입력하세요.'); return; }
    setSaving(true);
    try {
      const body = {
        clientId: clientId || undefined,
        clientName,
        currency,
        items: items.filter(i => i.description || i.amount > 0).map(i => ({ ...i, currency })),
        issuedDate,
        dueDate: dueDate || undefined,
        remark: remark || undefined,
        status: 'draft',
      };
      const res = await fetch('/api/foreign-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('저장 실패');
      onSave();
    } catch (e) { alert(`오류: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="font-semibold text-sm">외화 인보이스 생성</h2>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>거래처 (청구 대상)</label>
              <AcInput
                value={clientName}
                onChange={v => { setClientName(v); setClientId(''); }}
                options={companyOptions}
                placeholder="거래처명"
                onSelect={opt => { setClientName(opt.label); setClientId(opt.id || ''); }}
              />
            </div>
            <div>
              <label className={labelCls}>청구 통화</label>
              <select className={inputCls} value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>발행일</label>
              <Input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className={labelCls}>결제 기한</label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* 라인 아이템 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-muted-foreground">청구 내역</div>
              <button type="button" onClick={addItem} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />행 추가
              </button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left px-2.5 py-2 font-medium text-muted-foreground w-[28%]">내역 (Description)</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground w-12">수량</th>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground w-14">단위</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground w-24">단가</th>
                    <th className="text-center px-2 py-2 font-medium text-muted-foreground w-14">VAT포함</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground w-24">금액</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1.5">
                        <Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="내역 입력" className="h-7 text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="lot" className="h-7 text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={item.vatIncluded} onChange={e => updateItem(idx, 'vatIncluded', e.target.checked)} className="accent-primary w-3.5 h-3.5" />
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold">
                        {(item.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button type="button" onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40">
                  <tr className="border-t">
                    <td colSpan={5} className="px-2.5 py-2 text-right text-xs font-medium text-muted-foreground">소계 (Subtotal)</td>
                    <td className="px-2 py-2 text-right font-semibold text-xs">{subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                  {vatTotal > 0 && (
                    <tr>
                      <td colSpan={5} className="px-2.5 py-1 text-right text-xs text-muted-foreground">VAT (10%)</td>
                      <td className="px-2 py-1 text-right text-xs">{vatTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  )}
                  <tr className="border-t-2 font-bold">
                    <td colSpan={5} className="px-2.5 py-2 text-right text-sm">TOTAL ({currency})</td>
                    <td className="px-2 py-2 text-right text-sm text-primary">{total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 연결된 미청구 비용 */}
          {billable.length > 0 && (
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">연결 미청구 비용 ({billable.length}건 · 인보이스 생성 시 청구완료 처리)</div>
              <div className="space-y-1">
                {billable.slice(0, 5).map(r => (
                  <div key={r.id} className="flex justify-between text-xs text-muted-foreground">
                    <span>{r.description || COST_TYPE_LABELS[r.costType]} · {r.importBusinessId || r.shipmentBusinessId || '-'}</span>
                    <span>{(r.billAmount || r.costAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.billCurrency || r.costCurrency}</span>
                  </div>
                ))}
                {billable.length > 5 && <div className="text-xs text-muted-foreground">외 {billable.length - 5}건...</div>}
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>비고</label>
            <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="메모" className="h-9" />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-3.5 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button className="flex-1" onClick={handleCreate} disabled={saving || !clientName}>
            {saving ? '생성 중...' : '인보이스 생성'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ────────────────────────────────────────────────────────────

export default function CostsPage() {
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [invoices, setInvoices] = useState<ForeignInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'records' | 'invoices'>('records');

  const [filterDisposition, setFilterDisposition] = useState<string>('all');
  const [filterBillStatus, setFilterBillStatus] = useState<string>('all');
  const [filterCostType, setFilterCostType] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [editModal, setEditModal] = useState<{ open: boolean; record?: CostRecord | null }>({ open: false });
  const [invoiceModal, setInvoiceModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [crRes, fiRes] = await Promise.all([
      fetch('/api/cost-records').then(r => r.json()),
      fetch('/api/foreign-invoices').then(r => r.json()),
    ]);
    if (crRes.data) setRecords(crRes.data);
    if (fiRes.data) setInvoices(fiRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = records.filter(r => {
    if (filterDisposition !== 'all' && r.disposition !== filterDisposition) return false;
    if (filterBillStatus !== 'all' && r.billStatus !== filterBillStatus) return false;
    if (filterCostType !== 'all' && r.costType !== filterCostType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.description || '').toLowerCase().includes(q)
        || (r.importBusinessId || '').toLowerCase().includes(q)
        || (r.shipmentBusinessId || '').toLowerCase().includes(q)
        || (r.clientName || '').toLowerCase().includes(q)
        || COST_TYPE_LABELS[r.costType]?.includes(q);
    }
    return true;
  });

  const totalCostKrw = filtered.reduce((s, r) => s + (r.costAmountKrw || r.costAmount), 0);
  const pendingCount = filtered.filter(r => r.disposition === 'pending').length;
  const unbilledBillable = filtered.filter(r => r.disposition !== 'internal' && r.disposition !== 'pending' && r.billStatus === 'unbilled').length;
  const offsetPending = filtered.filter(r => r.offsetStatus === 'pending' || r.offsetStatus === 'partial').length;
  const fxBillable = records.filter(r => r.disposition === 'billable_foreign' && r.billStatus === 'unbilled').length;

  const handleQuickDisposition = async (id: string, disposition: CostRecord['disposition']) => {
    await fetch(`/api/cost-records/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disposition }) });
    load();
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="비용 원장" />

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-3 px-4 pt-4 shrink-0">
          {[
            { label: '총 비용 (원화)', value: `${Math.round(totalCostKrw).toLocaleString()}원`, sub: `${filtered.length}건`, color: 'text-foreground' },
            { label: '미결정', value: `${pendingCount}건`, sub: '처리방향 지정 필요', color: 'text-amber-600', icon: <Clock className="w-3.5 h-3.5" /> },
            { label: '미청구 (청구예정)', value: `${unbilledBillable}건`, sub: '인보이스/매출 미발행', color: 'text-blue-600', icon: <AlertCircle className="w-3.5 h-3.5" /> },
            { label: '상계 미결', value: `${offsetPending}건`, sub: '매입대금 상계 대기', color: 'text-purple-600', icon: <ChevronDown className="w-3.5 h-3.5" /> },
          ].map(({ label, value, sub, color, icon }) => (
            <div key={label} className="bg-background border rounded-xl px-4 py-3">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className={cn('text-lg font-bold flex items-center gap-1', color)}>{icon}{value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* 탭 + 툴바 */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2 shrink-0 border-b">
          <div className="flex gap-1">
            {[['records', '비용 원장'], ['invoices', '외화 인보이스']].map(([k, v]) => (
              <button key={k} onClick={() => setTab(k as typeof tab)}
                className={cn('text-sm px-3 py-1.5 rounded-md font-medium transition-colors', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                {v}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {tab === 'records' && (
              <>
                <Input className="h-8 w-36 text-xs" placeholder="검색..." value={search} onChange={e => setSearch(e.target.value)} />
                <select className="h-8 border rounded-md text-xs px-2" value={filterDisposition} onChange={e => setFilterDisposition(e.target.value)}>
                  <option value="all">처리방향 전체</option>
                  {Object.entries(DISPOSITION_LABELS).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <select className="h-8 border rounded-md text-xs px-2" value={filterBillStatus} onChange={e => setFilterBillStatus(e.target.value)}>
                  <option value="all">청구상태 전체</option>
                  {Object.entries(BILL_STATUS_LABELS).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <select className="h-8 border rounded-md text-xs px-2" value={filterCostType} onChange={e => setFilterCostType(e.target.value)}>
                  <option value="all">유형 전체</option>
                  {Object.entries(COST_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {fxBillable > 0 && (
                  <Button size="sm" variant="outline" className="h-8 text-xs border-green-400 text-green-700 hover:bg-green-50" onClick={() => setInvoiceModal(true)}>
                    <FileText className="w-3.5 h-3.5 mr-1" />외화 인보이스 ({fxBillable})
                  </Button>
                )}
                <Button size="sm" className="h-8 text-xs" onClick={() => setEditModal({ open: true, record: null })}>
                  <Plus className="w-3.5 h-3.5 mr-1" />비용 등록
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 탭 내용 */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'records' ? (
            loading ? (
              <div className="text-center py-16 text-muted-foreground text-sm">로딩 중...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">비용 항목이 없습니다.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    {['발생일', '유형', '설명 / 연결', '원가', '처리 방향', '청구금액', '청구상태', '환차손익', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const disp = DISPOSITION_LABELS[r.disposition];
                    const billSt = BILL_STATUS_LABELS[r.billStatus];
                    const costKrw = r.costAmountKrw || r.costAmount;
                    const billAmt = r.billAmount || r.costAmount;
                    const margin = (r.billAmount && r.billAmount !== r.costAmount) ? r.billAmount - r.costAmount : null;

                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setEditModal({ open: true, record: r })}>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.incurredDate || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{COST_TYPE_LABELS[r.costType] || r.costType}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium truncate max-w-[180px]">{r.description || '-'}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {[r.importBusinessId, r.shipmentBusinessId, r.clientName].filter(Boolean).join(' · ')}
                          </div>
                          {r.disposition === 'offset_purchase' && r.offsetItems?.length > 0 && (
                            <div className="text-[10px] text-purple-600">PO {r.offsetItems.length}건 연결</div>
                          )}
                          {r.linkedSaleId && (
                            <div className="text-[10px] text-blue-600">매출연결</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <div className="font-medium">{Math.round(costKrw).toLocaleString()}원</div>
                          {r.costCurrency !== 'KRW' && (
                            <div className="text-[10px] text-muted-foreground">{r.costAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.costCurrency}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.disposition === 'pending' ? (
                            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                              <button onClick={() => handleQuickDisposition(r.id, 'internal')}
                                className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded">내부</button>
                              <button onClick={() => handleQuickDisposition(r.id, 'billable_domestic')}
                                className="text-[10px] px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">국내</button>
                              <button onClick={() => handleQuickDisposition(r.id, 'billable_foreign')}
                                className="text-[10px] px-1.5 py-0.5 bg-green-100 hover:bg-green-200 text-green-700 rounded">외화</button>
                              <button onClick={() => handleQuickDisposition(r.id, 'offset_purchase')}
                                className="text-[10px] px-1.5 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded">상계</button>
                            </div>
                          ) : (
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', disp?.color)}>
                              {disp?.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.disposition !== 'internal' ? (
                            <>
                              <div className="font-medium">{billAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.billCurrency || r.costCurrency}</div>
                              {margin !== null && (
                                <div className={cn('text-[10px]', margin > 0 ? 'text-green-600' : 'text-red-500')}>
                                  {margin > 0 ? '+' : ''}{margin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </div>
                              )}
                            </>
                          ) : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn('text-xs font-medium', billSt?.color)}>{billSt?.label}</span>
                          {r.offsetStatus !== 'none' && (
                            <div className="text-[10px] text-purple-600">
                              {r.offsetStatus === 'pending' ? '상계예정' : r.offsetStatus === 'partial' ? `부분(잔:${r.offsetRemaining?.toLocaleString()})` : '완료'}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.fxGainLoss != null && r.fxGainLoss !== 0 ? (
                            <span className={cn('text-xs font-medium', r.fxGainLoss > 0 ? 'text-green-600' : 'text-red-500')}>
                              {r.fxGainLoss > 0 ? '+' : ''}{r.fxGainLoss.toLocaleString()}원
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {r.isAutoAllocated && <span className="text-[10px] text-blue-400">자동</span>}
                          {r.disposition === 'internal' && (
                            <button type="button"
                              onClick={e => { e.stopPropagation(); window.open(`/costs/expense-print?id=${r.id}`, '_blank'); }}
                              className="text-[10px] text-slate-500 hover:text-slate-800 ml-1" title="비용서 출력">
                              <Printer className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            <div className="p-4 space-y-2">
              <div className="flex justify-end mb-2">
                <Button size="sm" className="h-8 text-xs" onClick={() => setInvoiceModal(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />인보이스 생성
                </Button>
              </div>
              {invoices.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">발행된 외화 인보이스가 없습니다.</div>
              ) : invoices.map(inv => (
                <div key={inv.id} className="border rounded-xl px-4 py-3 bg-background">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-green-500" />
                      <div>
                        <div className="font-semibold text-sm">{inv.businessId}</div>
                        <div className="text-xs text-muted-foreground">{inv.clientName} · 발행일: {inv.issuedDate}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-bold">{inv.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {inv.currency}</div>
                        <div className={cn('text-xs', inv.status === 'paid' ? 'text-green-600' : inv.status === 'sent' ? 'text-blue-600' : 'text-muted-foreground')}>
                          {inv.status === 'draft' ? '초안' : inv.status === 'sent' ? '발송됨' : inv.status === 'paid' ? '수금완료' : '취소'}
                        </div>
                      </div>
                      <button
                        onClick={() => window.open(`/costs/invoice-print?id=${inv.id}`, '_blank')}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {inv.items.length > 0 && (
                    <div className="mt-2 pl-7 space-y-0.5">
                      {inv.items.map((item, i) => (
                        <div key={i} className="text-xs text-muted-foreground flex justify-between">
                          <span>{item.description}{item.qty > 1 ? ` × ${item.qty}${item.unit}` : ''}</span>
                          <span>{item.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.currency}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editModal.open && (
        <CostModal
          record={editModal.record || null}
          onClose={() => setEditModal({ open: false })}
          onSave={() => { setEditModal({ open: false }); load(); }}
        />
      )}
      {invoiceModal && (
        <ForeignInvoiceModal
          records={records}
          onClose={() => setInvoiceModal(false)}
          onSave={() => { setInvoiceModal(false); load(); }}
        />
      )}
    </div>
  );
}
