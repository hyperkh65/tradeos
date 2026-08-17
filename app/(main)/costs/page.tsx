'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Plus, X, FileText, Download, Check, AlertCircle, Clock, ChevronDown,
  Printer, Search, Trash2, Upload, Paperclip, Sparkles, Eye,
} from 'lucide-react';
import type { CostRecord, OffsetItem, CostLineItem, CostFileRecord } from '@/app/api/cost-records/route';
import type { ForeignInvoice, ForeignInvoiceItem } from '@/app/api/foreign-invoices/route';
import type { Import } from '@/types';

// ── 상수 ────────────────────────────────────────────────────────────────────

const COST_TYPE_LABELS: Record<string, string> = {
  duty: '관세', vat: '수입부가세', customs_broker: '관세사비',
  inspection: '세관검사비', warehouse: '창고료(장치료)',
  demurrage: '체화료(DEM)', detention: '지체료(DET)',
  inland_freight: '내륙운송비', ocean_freight: '해상운임',
  air_freight: '항공운임',
  certification: '인증비', as_service: 'A/S 현장비', labor: '인건비', other: '기타',
};

// 단위 기본값 per 비용 유형
const UNIT_DEFAULTS: Record<string, string[]> = {
  certification: ['건', '식', '품목', 'set', 'lot'],
  as_service: ['건', '시간', '일', '회', '식'],
  labor: ['시간', '일', '인', '명', '건'],
  other: ['건', 'lot', 'set', 'EA'],
};

const DETAIL_COST_TYPES = new Set(['certification', 'as_service', 'labor']);

const DISPOSITION_LABELS: Record<string, { label: string; color: string }> = {
  pending:            { label: '미결정',    color: 'bg-gray-100 text-gray-600' },
  internal:           { label: '내부비용',  color: 'bg-slate-100 text-slate-700' },
  billable_domestic:  { label: '국내 매출', color: 'bg-blue-100 text-blue-700' },
  billable_foreign:   { label: '외화 청구', color: 'bg-green-100 text-green-700' },
  offset_purchase:    { label: '매입 상계', color: 'bg-purple-100 text-purple-700' },
  selling_admin:      { label: '판매관리비', color: 'bg-orange-100 text-orange-700' },
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

// ── Autocomplete 컴포넌트 ────────────────────────────────────────────────────

interface AcOption { label: string; sub?: string; value: string; id?: string }

function AcInput({
  value, onChange, options, placeholder, onSelect,
}: {
  value: string; onChange: (v: string) => void; options: AcOption[];
  placeholder?: string; onSelect?: (opt: AcOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = value.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(value.toLowerCase()) ||
        (o.sub || '').toLowerCase().includes(value.toLowerCase())
      ).slice(0, 12)
    : options.slice(0, 12);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} placeholder={placeholder} className="h-9" />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-0.5 left-0 right-0 bg-background border rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(opt => (
            <button key={opt.value} type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b last:border-0"
              onMouseDown={e => { e.preventDefault(); onChange(opt.label); onSelect?.(opt); setOpen(false); }}>
              <div className="font-medium">{opt.label}</div>
              {opt.sub && <div className="text-muted-foreground text-[10px] mt-0.5">{opt.sub}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 청구상태 자동 계산 ─────────────────────────────────────────────────────

type SaleRef = { id: string; businessId: string; customer?: string; totalAmount?: number; saleDate?: string };

function computeBillStatus(
  disposition: string,
  linkedSales: { id: string; businessId: string; amount?: number }[],
  billTotal: number,
  createdInvoiceId: string | null,
  currentBillStatus: string,
  offsetItems: { amount: number }[],
  costAmount: number,
): CostRecord['billStatus'] {
  switch (disposition) {
    case 'internal': return 'waived';
    case 'pending': return 'unbilled';
    case 'billable_domestic':
    case 'selling_admin':
      if (linkedSales.length === 0) return 'unbilled';
      if (billTotal > 0 && linkedSales.some(ls => ls.amount != null && Math.abs((ls.amount || 0) - billTotal) < 1)) return 'collected';
      return 'invoiced';
    case 'billable_foreign':
      if (currentBillStatus === 'collected') return 'collected';
      if (createdInvoiceId) return 'invoiced';
      return 'unbilled';
    case 'offset_purchase': {
      const offTotal = offsetItems.reduce((s, i) => s + (i.amount || 0), 0);
      if (costAmount > 0 && offTotal >= costAmount) return 'offset';
      return 'unbilled';
    }
    default: return 'unbilled';
  }
}

// 청구상태 표시 (처리방향 + 상태 조합)
const BILL_STATUS_DISPLAY: Record<string, Record<string, { label: string; color: string }>> = {
  internal:          { waived: { label: '내부처리', color: 'text-slate-500' } },
  pending:           { unbilled: { label: '미결정', color: 'text-gray-400' } },
  billable_domestic: {
    unbilled:  { label: '매출연결 필요', color: 'text-amber-600' },
    invoiced:  { label: '연결됨(확인중)', color: 'text-blue-600' },
    collected: { label: '수금완료', color: 'text-green-600' },
  },
  selling_admin: {
    unbilled:  { label: '매출연결 필요', color: 'text-amber-600' },
    invoiced:  { label: '처리중', color: 'text-blue-600' },
    collected: { label: '처리완료', color: 'text-green-600' },
  },
  billable_foreign: {
    unbilled:  { label: '인보이스 미발행', color: 'text-amber-600' },
    invoiced:  { label: '입금 대기', color: 'text-blue-600' },
    collected: { label: '수금완료', color: 'text-green-600' },
  },
  offset_purchase: {
    unbilled:  { label: '상계 예정', color: 'text-purple-600' },
    offset:    { label: '상계완료', color: 'text-purple-700' },
  },
};

function getStatusDisplay(disposition: string, billStatus: string): { label: string; color: string } {
  return BILL_STATUS_DISPLAY[disposition]?.[billStatus]
    || BILL_STATUS_LABELS[billStatus]
    || { label: billStatus, color: 'text-gray-500' };
}

// ── 다중 매출 연결 선택기 ───────────────────────────────────────────────────

function LinkedSalesSelector({
  linkedSales, onChange, sales, billTotal,
}: {
  linkedSales: { id: string; businessId: string; amount?: number }[];
  onChange: (v: { id: string; businessId: string; amount?: number }[]) => void;
  sales: SaleRef[];
  billTotal: number;
}) {
  const [search, setSearch] = useState('');
  const filtered = (search.trim()
    ? sales.filter(s => `${s.businessId} ${s.customer || ''}`.toLowerCase().includes(search.toLowerCase()))
    : sales
  ).slice(0, 10);

  const isMatched = billTotal > 0 && linkedSales.some(ls => ls.amount != null && Math.abs((ls.amount || 0) - billTotal) < 1);

  return (
    <div className="space-y-2">
      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="거래처 또는 매출번호 검색..." className="h-8 text-xs" />

      {/* 매출 목록 */}
      <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto bg-white">
        {filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">매출 목록이 없습니다</div>
        ) : filtered.map(s => {
          const isLinked = !!linkedSales.find(ls => ls.id === s.id);
          return (
            <button key={s.id} type="button"
              onClick={() => {
                if (isLinked) {
                  onChange(linkedSales.filter(ls => ls.id !== s.id));
                } else {
                  onChange([...linkedSales, { id: s.id, businessId: s.businessId, amount: s.totalAmount }]);
                }
              }}
              className={cn('w-full text-left px-3 py-2 text-xs border-b last:border-0 hover:bg-muted/60 flex items-center gap-2 transition-colors', isLinked && 'bg-blue-50 border-blue-100')}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[11px]">{s.businessId}</div>
                <div className="text-muted-foreground text-[10px] truncate">{s.customer || '—'} · {s.saleDate || ''}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] font-medium">{s.totalAmount ? s.totalAmount.toLocaleString() : '—'}</div>
                {isLinked && <Check className="w-3 h-3 text-blue-600 ml-auto mt-0.5" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* 연결된 매출 요약 */}
      {linkedSales.length > 0 && (
        <div className={cn('text-[10px] flex items-center gap-1.5 px-2 py-1.5 rounded-lg', isMatched ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-600')}>
          {isMatched ? <Check className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
          <span>연결됨 {linkedSales.length}건</span>
          {isMatched ? <span>· 금액 일치 → 수금완료 처리</span> : <span>· 청구금액과 일치하는 매출 없음 → 확인필요</span>}
        </div>
      )}
    </div>
  );
}

// ── 통관 프리뷰 카드 ────────────────────────────────────────────────────────

function ImportPreviewCard({ imp, missingTypes, existingTypes, onAutoGenerate, generating }:
  { imp: Import; missingTypes: string[]; existingTypes: string[]; onAutoGenerate: () => void; generating: boolean }) {
  return (
    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sky-800">📋 통관 정보: {imp.businessId}</span>
        {imp.status && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-sky-100 text-sky-700">{imp.status}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-muted-foreground">
        <span>신고번호: <b className="text-foreground">{imp.declarationNo || '-'}</b></span>
        <span>신고일: <b className="text-foreground">{imp.declarationDate || '-'}</b></span>
        <span>관세사: <b className="text-foreground">{imp.brokerName || '-'}</b></span>
        <span>관세: <b className={imp.duty ? 'text-foreground' : 'text-muted-foreground'}>{imp.duty ? imp.duty.toLocaleString() + '원' : '없음'}</b></span>
        <span>부가세: <b className={imp.vat ? 'text-foreground' : 'text-muted-foreground'}>{imp.vat ? imp.vat.toLocaleString() + '원' : '없음'}</b></span>
        <span>관세사비: <b className={imp.brokerFee ? 'text-foreground' : 'text-muted-foreground'}>{imp.brokerFee ? imp.brokerFee.toLocaleString() + '원' : '없음'}</b></span>
        {imp.inspectionFee ? <span>검사비: <b className="text-foreground">{imp.inspectionFee.toLocaleString()}원</b></span> : null}
        {imp.inlandFreight ? <span>내륙운송: <b className="text-foreground">{imp.inlandFreight.toLocaleString()}원</b></span> : null}
        {imp.demurrage ? <span>체화료: <b className="text-foreground">{imp.demurrage.toLocaleString()}원</b></span> : null}
      </div>

      {/* 누락 비용 감지 */}
      {missingTypes.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 space-y-1.5">
          <div className="font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            이 통관건에 아래 비용 기록이 없습니다
          </div>
          <div className="text-amber-700">
            {missingTypes.map(t => COST_TYPE_LABELS[t] || t).join(' · ')}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white"
              onClick={onAutoGenerate} disabled={generating}>
              <Sparkles className="w-3 h-3 mr-1" />
              {generating ? '생성 중...' : '통관 자료 기준 자동 생성'}
            </Button>
            <span className="text-[10px] text-amber-600">내부비용으로 자동 생성 후 필요 시 처리방향 변경</span>
          </div>
        </div>
      )}
      {existingTypes.length > 0 && missingTypes.length === 0 && (
        <div className="flex items-center gap-1.5 text-green-700 text-[10px]">
          <Check className="w-3 h-3" />모든 비용이 기록되어 있습니다 ({existingTypes.join(', ')})
        </div>
      )}
    </div>
  );
}

// ── 선적 프리뷰 카드 ─────────────────────────────────────────────────────────

function ShipmentPreviewCard({ shipment }: {
  shipment: { id: string; businessId: string; blNo?: string; eta?: string; status?: string; pol?: string; pod?: string; forwarderName?: string; cbm?: number }
}) {
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-indigo-800">🚢 선적 정보: {shipment.businessId}</span>
        {shipment.status && <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">{shipment.status}</span>}
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-muted-foreground">
        <span>BL No: <b className="text-foreground">{shipment.blNo || '-'}</b></span>
        <span>ETA: <b className="text-foreground">{shipment.eta || '-'}</b></span>
        <span>포워더: <b className="text-foreground">{shipment.forwarderName || '-'}</b></span>
        {shipment.pol && <span>POL: <b className="text-foreground">{shipment.pol}</b></span>}
        {shipment.pod && <span>POD: <b className="text-foreground">{shipment.pod}</b></span>}
        {shipment.cbm != null && <span>CBM: <b className="text-foreground">{shipment.cbm}</b></span>}
      </div>
    </div>
  );
}

// ── 라인 아이템 테이블 (인증비/A/S) ─────────────────────────────────────────

function LineItemsTable({ items, onChange, costType }: {
  items: CostLineItem[]; onChange: (items: CostLineItem[]) => void; costType?: string;
}) {
  const defaultUnit = (UNIT_DEFAULTS[costType || 'other'] || ['건'])[0];
  const unitOptions = UNIT_DEFAULTS[costType || 'other'] || ['건', 'lot'];

  const update = (idx: number, field: keyof CostLineItem, val: string | number | boolean) => {
    const next = items.map((item, i) => {
      if (i !== idx) return item;
      const u = { ...item, [field]: val };
      if (field === 'qty' || field === 'unitPrice') {
        u.amount = Math.round((Number(u.qty) || 0) * (Number(u.unitPrice) || 0) * 100) / 100;
      }
      return u;
    });
    onChange(next);
  };

  const addRow = () => onChange([...items, { description: '', qty: 1, unit: defaultUnit, unitPrice: 0, vatIncluded: false, note: '', amount: 0 }]);
  const removeRow = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const vatTotal = items.reduce((s, i) => i.vatIncluded ? s + Math.round((i.amount / 1.1) * 0.1 * 100) / 100 : s, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground">비용 내역 (상세)</div>
        <button type="button" onClick={addRow} className="text-xs text-primary hover:underline flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" />항목 추가
        </button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground min-w-[180px]">내역</th>
              <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-16">수량</th>
              <th className="px-2 py-1.5 font-medium text-muted-foreground w-16">단위</th>
              <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-24">단가</th>
              <th className="text-center px-1 py-1.5 font-medium text-muted-foreground w-12">VAT</th>
              <th className="text-right px-2 py-1.5 font-medium text-muted-foreground w-24">금액</th>
              <th className="px-2 py-1.5 font-medium text-muted-foreground w-28">비고</th>
              <th className="w-7"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-2 py-1">
                  <Input value={item.description} onChange={e => update(idx, 'description', e.target.value)} placeholder="내역을 입력하세요" className="h-8 text-xs min-w-[160px]" />
                </td>
                <td className="px-2 py-1">
                  <Input type="number" value={item.qty} onChange={e => update(idx, 'qty', parseFloat(e.target.value) || 0)} className="h-8 text-xs text-right w-16" />
                </td>
                <td className="px-2 py-1">
                  <select className="h-8 border rounded text-xs px-1 w-full" value={item.unit}
                    onChange={e => update(idx, 'unit', e.target.value)}>
                    {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                    <option value="기타">기타</option>
                  </select>
                </td>
                <td className="px-2 py-1">
                  <Input type="number" value={item.unitPrice} onChange={e => update(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-8 text-xs text-right w-24" />
                </td>
                <td className="px-1 py-1 text-center">
                  <input type="checkbox" checked={item.vatIncluded} onChange={e => update(idx, 'vatIncluded', e.target.checked)} className="accent-primary w-4 h-4" />
                </td>
                <td className="px-2 py-1 text-right font-semibold text-sm">
                  {(item.amount || 0).toLocaleString()}
                </td>
                <td className="px-2 py-1">
                  <Input value={item.note} onChange={e => update(idx, 'note', e.target.value)} placeholder="비고" className="h-8 text-xs w-28" />
                </td>
                <td className="px-1 py-1 text-center">
                  <button type="button" onClick={() => removeRow(idx)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} className="text-center py-4 text-xs text-muted-foreground">항목을 추가하세요</td></tr>
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot className="bg-muted/30 border-t">
              <tr>
                <td colSpan={5} className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">소계</td>
                <td className="px-2 py-1.5 text-right font-semibold text-xs">{subtotal.toLocaleString()}</td>
                <td colSpan={2}></td>
              </tr>
              {vatTotal > 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-1 text-right text-xs text-muted-foreground">VAT (10%)</td>
                  <td className="px-2 py-1 text-right text-xs">{vatTotal.toLocaleString()}</td>
                  <td colSpan={2}></td>
                </tr>
              )}
              <tr className="font-bold">
                <td colSpan={5} className="px-2 py-1.5 text-right text-xs">합계</td>
                <td className="px-2 py-1.5 text-right text-sm text-primary">{subtotal.toLocaleString()}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── 파일 첨부 섹션 ──────────────────────────────────────────────────────────

function FileSection({ recordId, files, onChange }: {
  recordId?: string; files: CostFileRecord[]; onChange: (files: CostFileRecord[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || !recordId) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(fileList).forEach(f => fd.append('files', f));
    try {
      const res = await fetch(`/api/cost-records/${recordId}/files`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.data) onChange([...files, ...data.data]);
    } catch { /* ignore */ }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const handleDelete = async (fileId: string) => {
    if (!recordId) return;
    await fetch(`/api/cost-records/${recordId}/files?fileId=${fileId}`, { method: 'DELETE' });
    onChange(files.filter(f => f.id !== fileId));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" />첨부 파일 ({files.length}개)
        </div>
        {recordId && (
          <button type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs text-primary hover:underline flex items-center gap-1">
            <Upload className="w-3.5 h-3.5" />{uploading ? '업로드 중...' : '파일 추가'}
          </button>
        )}
        {!recordId && (
          <span className="text-[10px] text-muted-foreground">저장 후 파일을 첨부할 수 있습니다</span>
        )}
      </div>
      <input ref={inputRef} type="file" multiple className="hidden"
        onChange={e => handleUpload(e.target.files)}
        accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.zip" />

      {/* 드래그 드롭 영역 */}
      {recordId && (
        <div
          className={cn('border-2 border-dashed rounded-lg p-3 text-center text-xs text-muted-foreground transition-colors cursor-pointer hover:border-primary hover:bg-primary/5', uploading && 'opacity-50 pointer-events-none')}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}>
          <Upload className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
          파일을 드래그하거나 클릭하여 업로드 (PDF, 이미지, Excel, Word 등 · 수십 개 가능)
        </div>
      )}

      {/* 파일 목록 */}
      {files.length > 0 && (
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/40 rounded-lg group">
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 text-xs truncate">{f.originalName}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(f.size)}</span>
              <a href={f.url} target="_blank" className="text-muted-foreground hover:text-primary shrink-0" title="열기">
                <Eye className="w-3.5 h-3.5" />
              </a>
              {recordId && (
                <button type="button" onClick={() => handleDelete(f.id)}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 비용 상세/편집 모달 ────────────────────────────────────────────────────

interface FullShipment {
  id: string; businessId: string; blNo?: string; eta?: string; status?: string;
  pol?: string; pod?: string; forwarderName?: string; cbm?: number;
}

interface RefData {
  shipments: FullShipment[];
  imports: Import[];
  companies: { id: string; name: string; type?: string }[];
  purchaseOrders: { id: string; businessId: string; supplierName: string; totalAmount?: number; currency?: string; items?: { productName?: string }[] }[];
  sales: { id: string; businessId: string; customer?: string; totalAmount?: number; saleDate?: string }[];
}

function CostModal({ record, onClose, onSave }: {
  record: CostRecord | null; onClose: () => void; onSave: () => void;
}) {
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
    vendorName: record?.vendorName || '',
    vendorId: record?.vendorId || '',
    importBusinessId: record?.importBusinessId || '',
    importId: record?.importId || '',
    shipmentBusinessId: record?.shipmentBusinessId || '',
    shipmentId: record?.shipmentId || '',
    linkedSaleId: record?.linkedSaleId || '',
    linkedSaleLabel: '',
    isLocked: false,
  });

  const [offsetItems, setOffsetItems] = useState<OffsetItem[]>(record?.offsetItems || []);
  const [costItems, setCostItems] = useState<CostLineItem[]>(record?.costItems || []);
  const [lineItems, setLineItems] = useState<CostLineItem[]>(record?.lineItems || []);
  const [linkedSales, setLinkedSales] = useState<{ id: string; businessId: string; amount?: number }[]>(record?.linkedSales || []);
  const [files, setFiles] = useState<CostFileRecord[]>(record?.files || []);
  const [poSearch, setPoSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // 통관 프리뷰 관련
  const [linkedImport, setLinkedImport] = useState<Import | null>(null);
  const [linkedShipment, setLinkedShipment] = useState<FullShipment | null>(null);
  const [missingCostTypes, setMissingCostTypes] = useState<string[]>([]);
  const [existingCostTypes, setExistingCostTypes] = useState<string[]>([]);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenerated, setAutoGenerated] = useState(false);

  // 잠금 상태 체크
  useEffect(() => {
    if (!record?.createdAt) return;
    const createdAt = new Date(record.createdAt);
    const lockDate = new Date(createdAt.getFullYear(), createdAt.getMonth() + 1, 10);
    setIsLocked(new Date() > lockDate);
  }, [record?.createdAt]);

  // 참조 데이터 로드
  useEffect(() => {
    Promise.all([
      fetch('/api/shipments').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/imports').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/companies').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/purchase-orders').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/sales').then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([sh, im, co, po, sa]) => {
      setRef({
        shipments: (sh.data || []).map((s: Record<string, unknown>) => ({
          id: s.id, businessId: s.businessId, blNo: s.blNo, eta: s.eta, status: s.status,
          pol: s.pol, pod: s.pod, forwarderName: s.forwarderName, cbm: s.cbm,
        } as FullShipment)),
        imports: im.data || [],
        companies: (co.data || []).map((c: Record<string, unknown>) => ({ id: c.id, name: c.name, type: c.type } as { id: string; name: string; type?: string })),
        purchaseOrders: (po.data || []).map((p: Record<string, unknown>) => ({
          id: p.id, businessId: p.businessId, supplierName: p.supplierName,
          totalAmount: p.totalAmount, currency: p.currency, items: p.items,
        } as RefData['purchaseOrders'][0])),
        sales: (sa.data || []).map((s: Record<string, unknown>) => ({
          id: s.id, businessId: s.businessId, customer: s.customer, totalAmount: s.totalAmount, saleDate: s.saleDate,
        } as RefData['sales'][0])),
      });
      // 기존 연결된 매출 레이블
      if (record?.linkedSaleId) {
        const found = sa.data?.find((s: Record<string, unknown>) => s.id === record.linkedSaleId);
        if (found) setForm(f => ({ ...f, linkedSaleLabel: `${found.businessId} · ${found.customer}` }));
      }
    });
  }, []);

  // 통관 연결 시 프리뷰 + 누락 비용 감지
  useEffect(() => {
    if (!form.importId && !form.importBusinessId) { setLinkedImport(null); setMissingCostTypes([]); setExistingCostTypes([]); return; }
    const imp = ref.imports.find(i => i.id === form.importId || i.businessId === form.importBusinessId);
    if (!imp) return;
    setLinkedImport(imp);

    // 현재 이 통관건의 기존 비용 레코드 확인
    fetch(`/api/cost-records?importId=${imp.id}`)
      .then(r => r.json())
      .then(d => {
        const existing: CostRecord[] = d.data || [];
        const existTypes = existing.map(r => r.costType);
        setExistingCostTypes(existTypes);

        // 통관 데이터에 있지만 비용 레코드가 없는 항목 감지
        const impAny = imp as unknown as Record<string, unknown>;
        const customCosts: { name: string; amount: number }[] = (() => {
          try { return (impAny.customCosts as { name: string; amount: number }[]) || []; } catch { return []; }
        })();
        const toCheck: Array<[string, number | undefined, string?]> = [
          ['duty', imp.duty],
          ['vat', imp.vat],
          ['customs_broker', imp.brokerFee],
          ['inspection', imp.inspectionFee],
          ['inland_freight', imp.inlandFreight],
          ['demurrage', imp.demurrage],
          ['detention', impAny.detentionFee as number | undefined],
          ['warehouse', imp.warehouseFee],
          ['ocean_freight', imp.freightKrw || (imp.freightUsd ? imp.freightUsd * ((impAny.freightExchangeRate as number) || 1) : undefined)],
        ];
        // 기타비용(customCosts) 합계 추가
        const customCostsTotal = customCosts.reduce((s, c) => s + (c.amount || 0), 0);
        if (customCostsTotal > 0 && !existTypes.includes('other')) {
          toCheck.push(['other', customCostsTotal, '기타비용']);
        }
        const missing = toCheck
          .filter(([type, amount]) => amount && amount > 0 && !existTypes.includes(type))
          .map(([type]) => type);
        setMissingCostTypes(missing);
      });
  }, [form.importId, form.importBusinessId, ref.imports]);

  // 선적 연결 프리뷰
  useEffect(() => {
    if (!form.shipmentId && !form.shipmentBusinessId) { setLinkedShipment(null); return; }
    const sh = ref.shipments.find(s => s.id === form.shipmentId || s.businessId === form.shipmentBusinessId);
    setLinkedShipment(sh || null);
  }, [form.shipmentId, form.shipmentBusinessId, ref.shipments]);

  // 통관 자동 비용 생성
  const handleAutoGenerate = async () => {
    if (!linkedImport) return;
    setAutoGenerating(true);
    const impAny = linkedImport as unknown as Record<string, unknown>;
    const customCosts: { name: string; amount: number }[] = (() => {
      try { return (impAny.customCosts as { name: string; amount: number }[]) || []; } catch { return []; }
    })();

    const costTypeMap: Array<{ type: string; amount: number | undefined; currency: string; description?: string }> = [
      { type: 'duty',          amount: linkedImport.duty,          currency: 'KRW' },
      { type: 'vat',           amount: linkedImport.vat,           currency: 'KRW' },
      { type: 'customs_broker', amount: linkedImport.brokerFee,    currency: 'KRW' },
      { type: 'inspection',    amount: linkedImport.inspectionFee, currency: 'KRW' },
      { type: 'inland_freight', amount: linkedImport.inlandFreight, currency: 'KRW' },
      { type: 'demurrage',     amount: linkedImport.demurrage,     currency: 'KRW' },
      { type: 'detention',     amount: impAny.detentionFee as number | undefined, currency: 'KRW' },
      { type: 'warehouse',     amount: linkedImport.warehouseFee,  currency: 'KRW' },
      { type: 'ocean_freight', amount: linkedImport.freightKrw || (linkedImport.freightUsd ? linkedImport.freightUsd * ((impAny.freightExchangeRate as number) || 1) : undefined), currency: 'KRW' },
    ];

    const toCreate = costTypeMap.filter(
      c => c.amount && c.amount > 0 && !existingCostTypes.includes(c.type) && missingCostTypes.includes(c.type)
    );

    const baseBody = {
      disposition: 'internal',
      importId: linkedImport.id,
      importBusinessId: linkedImport.businessId,
      shipmentId: form.shipmentId || undefined,
      shipmentBusinessId: form.shipmentBusinessId || undefined,
      incurredDate: (linkedImport as unknown as Record<string, unknown>).declarationDate as string || (linkedImport as unknown as Record<string, unknown>).arrivalDate as string || new Date().toISOString().slice(0, 10),
      isAutoAllocated: true,
    };

    for (const cost of toCreate) {
      await fetch('/api/cost-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...baseBody,
          costType: cost.type,
          description: COST_TYPE_LABELS[cost.type],
          costAmount: cost.amount,
          costCurrency: cost.currency,
          clientName: (cost.type === 'customs_broker' || cost.type === 'inspection') ? ((linkedImport as unknown as Record<string, unknown>).brokerName as string || undefined) : undefined,
        }),
      });
    }

    // 기타비용(customCosts) 각각 생성
    if (missingCostTypes.includes('other') && customCosts.length > 0 && !existingCostTypes.includes('other')) {
      for (const cc of customCosts.filter(c => c.name && c.amount > 0)) {
        await fetch('/api/cost-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...baseBody,
            costType: 'other',
            description: cc.name,
            costAmount: cc.amount,
            costCurrency: 'KRW',
          }),
        });
      }
    }

    setAutoGenerating(false);
    setAutoGenerated(true);
    setMissingCostTypes([]);
    setExistingCostTypes(prev => [...prev, ...toCreate.map(c => c.type)]);
    setTimeout(onSave, 100);
  };

  // 라인 아이템 합계 → costAmount 자동 반영
  const lineItemsTotal = lineItems.reduce((s, i) => s + (i.amount || 0), 0);
  const isDetailType = DETAIL_COST_TYPES.has(form.costType);

  const costKrw = form.costCurrency === 'KRW'
    ? (isDetailType && lineItems.length > 0 ? lineItemsTotal : parseFloat(form.costAmount || '0'))
    : parseFloat(form.costAmount || '0') * parseFloat(form.fxRateAtCost || '1');

  const effectiveCostAmount = isDetailType
    ? (costItems.length > 0 ? costItems.reduce((s, i) => s + (i.amount || 0), 0) : parseFloat(form.costAmount || '0'))
    : parseFloat(form.costAmount || '0');
  const billFinal = lineItemsTotal > 0 ? lineItemsTotal : parseFloat(form.billAmount || effectiveCostAmount.toString() || '0');
  const margin = billFinal - effectiveCostAmount;
  const offsetTotal = offsetItems.reduce((s, i) => s + (i.amount || 0), 0);

  const addOffsetPo = (po: RefData['purchaseOrders'][0]) => {
    if (offsetItems.find(i => i.poId === po.id)) return;
    setOffsetItems(prev => [...prev, {
      poId: po.id, poBusinessId: po.businessId, supplierName: po.supplierName,
      description: '', qty: 1, amount: 0, currency: po.currency || 'KRW',
    }]);
    setPoSearch('');
  };

  const filteredPos = ref.purchaseOrders.filter(p =>
    p.businessId.toLowerCase().includes(poSearch.toLowerCase()) ||
    p.supplierName.toLowerCase().includes(poSearch.toLowerCase())
  ).slice(0, 8);

  // 원가 합계 (costItems or costAmount)
  const costItemsTotal = costItems.reduce((s, i) => s + (i.amount || 0), 0);
  const effectiveCostItems = isDetailType && costItems.length > 0;
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(record?.linkedInvoiceId || null);

  const buildBody = () => {
    const finalCostAmount = effectiveCostItems ? costItemsTotal : parseFloat(form.costAmount || '0');
    const billLineItems = lineItems.length > 0 ? lineItems : [];
    const billTotal = billLineItems.reduce((s, i) => s + (i.amount || 0), 0);
    return {
      costType: form.costType,
      description: form.description || undefined,
      costAmount: finalCostAmount,
      costCurrency: form.costCurrency,
      fxRateAtCost: parseFloat(form.fxRateAtCost || '1'),
      incurredDate: form.incurredDate,
      disposition: form.disposition,
      billAmount: billTotal > 0 ? billTotal : (form.billAmount ? parseFloat(form.billAmount) : undefined),
      billCurrency: form.billCurrency,
      billStatus: form.billStatus,
      causeType: form.causeType,
      offsetStatus: form.offsetStatus,
      offsetRemaining: form.offsetRemaining ? parseFloat(form.offsetRemaining) : undefined,
      offsetItems: form.disposition === 'offset_purchase' ? offsetItems : [],
      costItems: isDetailType ? costItems : [],
      lineItems: billLineItems,
      fxRateAtSettle: form.fxRateAtSettle ? parseFloat(form.fxRateAtSettle) : undefined,
      settledAt: form.settledAt || undefined,
      remark: form.remark || undefined,
      clientName: form.clientName || undefined,
      clientId: form.clientId || undefined,
      companyId: form.companyId || undefined,
      vendorName: form.vendorName || undefined,
      vendorId: form.vendorId || undefined,
      importBusinessId: form.importBusinessId || undefined,
      importId: form.importId || undefined,
      shipmentBusinessId: form.shipmentBusinessId || undefined,
      shipmentId: form.shipmentId || undefined,
      linkedSaleId: form.linkedSaleId || undefined,
      linkedSales,
    };
  };

  const handleSave = async () => {
    if (!isDetailType && !form.costAmount && lineItems.length === 0) { alert('원가금액 또는 내역을 입력하세요.'); return; }
    setSaving(true);
    try {
      const body = buildBody();

      // 처리방향에 따른 billStatus 자동 계산
      const billTotalForStatus = lineItems.reduce((s, i) => s + (i.amount || 0), 0) || parseFloat(form.billAmount || '0');
      body.billStatus = computeBillStatus(
        form.disposition, linkedSales, billTotalForStatus, createdInvoiceId, form.billStatus, offsetItems, effectiveCostAmount,
      );

      // 매입상계 — offsetItems 합계로 offsetStatus 자동 결정
      if (form.disposition === 'offset_purchase') {
        const offTotal = offsetItems.reduce((s, i) => s + (i.amount || 0), 0);
        const costAmt = effectiveCostAmount;
        body.offsetStatus = offTotal >= costAmt && costAmt > 0 ? 'completed' : offTotal > 0 ? 'partial' : 'pending';
        body.offsetRemaining = Math.max(0, costAmt - offTotal);
      }

      if (isNew) {
        const res = await fetch('/api/cost-records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('저장 실패');
      } else {
        const res = await fetch(`/api/cost-records/${record!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '저장 실패');
        }
      }
      onSave();
    } catch (e) { alert(`오류: ${e}`); }
    finally { setSaving(false); }
  };

  const handleSaveAndInvoice = async () => {
    if (lineItems.length === 0) { alert('청구 내역을 먼저 입력하세요.'); return; }
    if (!form.clientName) { alert('청구처(상대방)를 선택하세요.'); return; }
    setSaving(true);
    try {
      const body = buildBody();
      let savedId = record?.id;
      if (isNew) {
        const res = await fetch('/api/cost-records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('저장 실패');
        savedId = (await res.json()).data?.id;
      } else {
        const res = await fetch(`/api/cost-records/${record!.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('수정 실패');
      }
      // 외화 인보이스 생성
      const billTotal = lineItems.reduce((s, i) => s + (i.amount || 0), 0);
      const invRes = await fetch('/api/foreign-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: form.clientId || undefined,
          clientName: form.clientName,
          currency: form.billCurrency,
          items: lineItems,
          issuedDate: form.incurredDate,
          remark: form.remark || undefined,
        }),
      });
      if (!invRes.ok) throw new Error('인보이스 생성 실패');
      const inv = await invRes.json();
      const invId = inv.data?.id;
      if (invId && savedId) {
        await fetch(`/api/cost-records/${savedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ linkedInvoiceId: invId, billStatus: 'invoiced' }),
        });
        setCreatedInvoiceId(invId);
      }
      onSave();
      if (invId) window.open(`/costs/invoice-print?id=${invId}`, '_blank');
    } catch (e) { alert(`오류: ${e}`); }
    finally { setSaving(false); }
  };

  const shipmentOptions: AcOption[] = ref.shipments.map(s => ({
    label: s.businessId,
    sub: [s.blNo, s.eta ? `ETA ${s.eta}` : '', s.status].filter(Boolean).join(' · '),
    value: s.businessId, id: s.id,
  }));

  const importOptions: AcOption[] = ref.imports.map(i => ({
    label: i.businessId,
    sub: [
      i.declarationNo ? `신고: ${i.declarationNo}` : '',
      i.duty ? `관세 ${i.duty.toLocaleString()}원` : '',
      i.brokerName || '',
    ].filter(Boolean).join(' · '),
    value: i.businessId, id: i.id,
  }));

  const companyOptions: AcOption[] = ref.companies.map(c => ({ label: c.name, sub: c.type, value: c.name, id: c.id }));
  const salesOptions: AcOption[] = ref.sales.map(s => ({
    label: `${s.businessId} · ${s.customer || ''}`,
    sub: s.saleDate, value: s.id, id: s.id,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="font-semibold text-sm">{isNew ? '비용 등록' : '비용 수정'} — {COST_TYPE_LABELS[form.costType] || form.costType}</h2>
          <div className="flex items-center gap-2">
            {!isNew && (form.disposition === 'internal' || isDetailType) && (
              <button type="button"
                onClick={() => window.open(isDetailType ? `/costs/cert-print?id=${record!.id}` : `/costs/expense-print?id=${record!.id}`, '_blank')}
                className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50">
                <Printer className="w-3.5 h-3.5" />{isDetailType ? '인보이스 출력' : '비용서 출력'}
              </button>
            )}
            <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLocked && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              익월 10일이 지나 마감된 비용입니다. 관리자만 수정할 수 있습니다.
            </div>
          )}
          {record?.isAutoAllocated && (
            <div className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              통관 입력 시 자동 생성된 비용입니다. 처리 방향만 변경 가능합니다.
            </div>
          )}

          {autoGenerated && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />비용이 내부비용으로 자동 생성되었습니다. 필요 시 각 비용을 클릭하여 수정하세요.
            </div>
          )}

          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>비용 유형</label>
              <select className={inputCls} value={form.costType} onChange={e => {
                setForm(f => ({ ...f, costType: e.target.value }));
                if (DETAIL_COST_TYPES.has(e.target.value) && lineItems.length === 0) {
                  setLineItems([{ description: '', qty: 1, unit: 'EA', unitPrice: 0, vatIncluded: false, note: '', amount: 0 }]);
                }
              }}>
                {Object.entries(COST_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>발생일</label>
              <Input type="date" value={form.incurredDate} onChange={e => setForm(f => ({ ...f, incurredDate: e.target.value }))} className="h-9" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>설명 / 제목</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="비용 설명 또는 프로젝트명" className="h-9" />
            </div>
          </div>

          {/* 인증비 / A/S / 인건비 — 원가 섹션만 */}
          {isDetailType && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-700">📦 원가 (실제 지출)</div>
                {costItemsTotal > 0 && (
                  <div className="text-xs font-bold text-slate-700">
                    원가 합계: {costItemsTotal.toLocaleString()} {form.costCurrency}
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>지급처 (없으면 내부 직접 처리)</label>
                <AcInput
                  value={form.vendorName}
                  onChange={v => setForm(f => ({ ...f, vendorName: v, vendorId: '' }))}
                  options={companyOptions}
                  placeholder="비용 지급한 업체명 (없으면 비워두세요)"
                  onSelect={opt => setForm(f => ({ ...f, vendorName: opt.label, vendorId: opt.id || '' }))}
                />
                {!form.vendorName && <p className="text-[10px] text-muted-foreground mt-1">비워두면 내부 직접 처리로 표시됩니다.</p>}
              </div>
              <LineItemsTable items={costItems} onChange={setCostItems} costType={form.costType} />
              {costItems.length === 0 && (
                <div>
                  <label className={labelCls}>원가 금액 (직접 입력)</label>
                  <div className="flex gap-2">
                    <Input type="number" value={form.costAmount} onChange={e => setForm(f => ({ ...f, costAmount: e.target.value }))} placeholder="0" className="h-9 flex-1" />
                    <select className={inputCls + ' w-24'} value={form.costCurrency} onChange={e => setForm(f => ({ ...f, costCurrency: e.target.value }))}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 원가 (인증비/AS가 아닌 경우) */}
          {!isDetailType && (
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
          )}

          {/* 연결 정보 */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold text-sky-800">연결 정보</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>선적 연결 (SHP-)</label>
                <AcInput
                  value={form.shipmentBusinessId}
                  onChange={v => setForm(f => ({ ...f, shipmentBusinessId: v, shipmentId: '' }))}
                  options={shipmentOptions}
                  placeholder="SHP- 입력 또는 검색"
                  onSelect={opt => setForm(f => ({ ...f, shipmentBusinessId: opt.label, shipmentId: opt.id || '' }))}
                />
              </div>
              <div>
                <label className={labelCls}>통관 연결 (IMP-)</label>
                <AcInput
                  value={form.importBusinessId}
                  onChange={v => setForm(f => ({ ...f, importBusinessId: v, importId: '' }))}
                  options={importOptions}
                  placeholder="IMP- 입력 또는 검색"
                  onSelect={opt => setForm(f => ({ ...f, importBusinessId: opt.label, importId: opt.id || '' }))}
                />
              </div>
              {!isDetailType && (
                <div className="col-span-2">
                  <label className={labelCls}>거래처 / 업체명</label>
                  <AcInput
                    value={form.clientName}
                    onChange={v => setForm(f => ({ ...f, clientName: v, clientId: '' }))}
                    options={companyOptions}
                    placeholder="거래처명 검색 또는 직접 입력"
                    onSelect={opt => setForm(f => ({ ...f, clientName: opt.label, clientId: opt.id || '', companyId: opt.id || '' }))}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 선적 프리뷰 */}
          {linkedShipment && <ShipmentPreviewCard shipment={linkedShipment} />}

          {/* 통관 프리뷰 + 누락 비용 */}
          {linkedImport && (
            <ImportPreviewCard
              imp={linkedImport}
              missingTypes={missingCostTypes}
              existingTypes={existingCostTypes}
              onAutoGenerate={handleAutoGenerate}
              generating={autoGenerating}
            />
          )}

          {/* 처리 방향 */}
          <div>
            <label className={labelCls}>처리 방향</label>
            <div className="grid grid-cols-6 gap-1.5">
              {Object.entries(DISPOSITION_LABELS).map(([k, { label, color }]) => (
                <button key={k} type="button"
                  onClick={() => setForm(f => ({ ...f, disposition: k as CostRecord['disposition'] }))}
                  className={cn('text-xs px-2 py-2 rounded-lg border transition-all text-center', form.disposition === k ? 'border-primary ring-1 ring-primary ' + color : 'border-border hover:bg-muted')}>
                  <span className={cn('block text-[10px] font-semibold', form.disposition === k ? '' : 'text-muted-foreground')}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 국내 매출 */}
          {form.disposition === 'billable_domestic' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-blue-800">국내 매출 청구</div>
                {lineItemsTotal > 0 && <div className="text-xs font-bold text-blue-800">청구 합계: {lineItemsTotal.toLocaleString()} {form.billCurrency}</div>}
              </div>
              {(() => {
                const bTotal = lineItems.reduce((s, i) => s + (i.amount || 0), 0) || parseFloat(form.billAmount || '0');
                const autoStatus = computeBillStatus('billable_domestic', linkedSales, bTotal, createdInvoiceId, form.billStatus, offsetItems, effectiveCostAmount);
                const statusInfo = getStatusDisplay('billable_domestic', autoStatus);
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">청구 상태:</span>
                    <span className={cn('text-xs font-semibold', statusInfo.color)}>{statusInfo.label}</span>
                    <span className="text-[10px] text-muted-foreground">(자동 결정)</span>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>청구처 (상대방)</label>
                  <AcInput
                    value={form.clientName}
                    onChange={v => setForm(f => ({ ...f, clientName: v, clientId: '' }))}
                    options={companyOptions}
                    placeholder="청구할 업체명"
                    onSelect={opt => setForm(f => ({ ...f, clientName: opt.label, clientId: opt.id || '', companyId: opt.id || '' }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>통화</label>
                  <select className={inputCls} value={form.billCurrency} onChange={e => setForm(f => ({ ...f, billCurrency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <LineItemsTable items={lineItems} onChange={setLineItems} costType={form.costType} />
              {lineItems.length === 0 && (
                <div>
                  <label className={labelCls}>청구 금액 (직접 입력)</label>
                  <Input type="number" value={form.billAmount} onChange={e => setForm(f => ({ ...f, billAmount: e.target.value }))} placeholder={effectiveCostAmount.toString() || '원가와 동일'} className="h-9" />
                </div>
              )}
              {margin !== 0 && (lineItemsTotal > 0 || form.billAmount) && (
                <div className={cn('text-xs font-medium', margin > 0 ? 'text-green-700' : 'text-red-600')}>
                  마진: {margin >= 0 ? '+' : ''}{margin.toLocaleString(undefined, { maximumFractionDigits: 2 })} {form.billCurrency}
                </div>
              )}
              <div>
                <label className={labelCls}>연결 매출 (클릭으로 선택)</label>
                <LinkedSalesSelector
                  linkedSales={linkedSales}
                  onChange={setLinkedSales}
                  sales={ref.sales}
                  billTotal={lineItems.reduce((s, i) => s + (i.amount || 0), 0) || parseFloat(form.billAmount || '0')}
                />
              </div>
            </div>
          )}

          {/* 판매관리비 */}
          {form.disposition === 'selling_admin' && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-orange-800">판매관리비</div>
                {lineItemsTotal > 0 && <div className="text-xs font-bold text-orange-800">합계: {lineItemsTotal.toLocaleString()} {form.billCurrency}</div>}
              </div>
              {(() => {
                const bTotal = lineItems.reduce((s, i) => s + (i.amount || 0), 0) || parseFloat(form.billAmount || '0');
                const autoStatus = computeBillStatus('selling_admin', linkedSales, bTotal, createdInvoiceId, form.billStatus, offsetItems, effectiveCostAmount);
                const statusInfo = getStatusDisplay('selling_admin', autoStatus);
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">청구 상태:</span>
                    <span className={cn('text-xs font-semibold', statusInfo.color)}>{statusInfo.label}</span>
                    <span className="text-[10px] text-muted-foreground">(자동 결정)</span>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>청구처 (상대방)</label>
                  <AcInput
                    value={form.clientName}
                    onChange={v => setForm(f => ({ ...f, clientName: v, clientId: '' }))}
                    options={companyOptions}
                    placeholder="청구할 업체명"
                    onSelect={opt => setForm(f => ({ ...f, clientName: opt.label, clientId: opt.id || '', companyId: opt.id || '' }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>통화</label>
                  <select className={inputCls} value={form.billCurrency} onChange={e => setForm(f => ({ ...f, billCurrency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <LineItemsTable items={lineItems} onChange={setLineItems} costType={form.costType} />
              {lineItems.length === 0 && (
                <div>
                  <label className={labelCls}>청구 금액 (직접 입력)</label>
                  <Input type="number" value={form.billAmount} onChange={e => setForm(f => ({ ...f, billAmount: e.target.value }))} placeholder={effectiveCostAmount.toString() || '원가와 동일'} className="h-9" />
                </div>
              )}
              <div>
                <label className={labelCls}>연결 매출 (클릭으로 선택)</label>
                <LinkedSalesSelector
                  linkedSales={linkedSales}
                  onChange={setLinkedSales}
                  sales={ref.sales}
                  billTotal={lineItems.reduce((s, i) => s + (i.amount || 0), 0) || parseFloat(form.billAmount || '0')}
                />
              </div>
            </div>
          )}

          {/* 외화 청구 */}
          {form.disposition === 'billable_foreign' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-green-800">💰 외화 청구 — 청구 내역</div>
                {lineItemsTotal > 0 && <div className="text-xs font-bold text-green-800">청구 합계: {lineItemsTotal.toLocaleString()} {form.billCurrency}</div>}
              </div>

              {(() => {
                const autoStatus = computeBillStatus('billable_foreign', linkedSales, 0, createdInvoiceId, form.billStatus, offsetItems, effectiveCostAmount);
                const statusInfo = getStatusDisplay('billable_foreign', autoStatus);
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">청구 상태:</span>
                    <span className={cn('text-xs font-semibold', statusInfo.color)}>{statusInfo.label}</span>
                    {autoStatus === 'invoiced' && record?.id && (
                      <button type="button"
                        onClick={async () => {
                          if (!confirm('입금 확인 처리하시겠습니까?')) return;
                          const res = await fetch(`/api/cost-records/${record.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billStatus: 'collected' }) });
                          if (res.ok) { setForm(f => ({ ...f, billStatus: 'collected' })); onSave(); }
                        }}
                        className="text-[10px] px-2 py-0.5 bg-green-100 hover:bg-green-200 text-green-700 rounded border border-green-300">
                        입금확인
                      </button>
                    )}
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className={labelCls}>청구처 (상대방 업체)</label>
                  <AcInput
                    value={form.clientName}
                    onChange={v => setForm(f => ({ ...f, clientName: v, clientId: '' }))}
                    options={companyOptions}
                    placeholder="청구할 업체명 검색 (외국 업체 포함)"
                    onSelect={opt => setForm(f => ({ ...f, clientName: opt.label, clientId: opt.id || '', companyId: opt.id || '' }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>청구 통화</label>
                  <select className={inputCls} value={form.billCurrency} onChange={e => setForm(f => ({ ...f, billCurrency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-green-800">청구 내역</div>
                {(costItemsTotal > 0 || parseFloat(form.costAmount||'0') > 0) && (
                  <button type="button"
                    onClick={() => setLineItems(costItems.length > 0 ? costItems.map(i=>({...i})) : [{ description: form.description || '', qty: 1, unit: '건', unitPrice: parseFloat(form.costAmount||'0'), vatIncluded: false, note: '', amount: parseFloat(form.costAmount||'0') }])}
                    className="text-[10px] border border-green-400 text-green-700 px-2 py-0.5 rounded hover:bg-green-100">
                    원가 복사
                  </button>
                )}
              </div>
              <LineItemsTable items={lineItems} onChange={setLineItems} costType={form.costType} />

              {margin !== 0 && (lineItemsTotal > 0) && (
                <div className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg', margin > 0 ? 'bg-green-100 text-green-800' : 'bg-red-50 text-red-700')}>
                  {margin > 0 ? '잡이익' : '잡손실'}: {margin >= 0 ? '+' : ''}{margin.toLocaleString(undefined, { maximumFractionDigits: 2 })} {form.billCurrency}
                  {effectiveCostAmount > 0 && <span className="ml-2 opacity-70">({((margin/effectiveCostAmount)*100).toFixed(1)}%)</span>}
                </div>
              )}

              {createdInvoiceId ? (
                <div className="flex items-center gap-2">
                  <div className="text-xs text-green-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" />인보이스 발행됨</div>
                  <button type="button" onClick={() => window.open(`/costs/invoice-print?id=${createdInvoiceId}`, '_blank')}
                    className="text-xs border border-green-400 text-green-700 px-2.5 py-1 rounded-lg hover:bg-green-100 flex items-center gap-1">
                    <Printer className="w-3.5 h-3.5" />인보이스 출력
                  </button>
                </div>
              ) : (
                <button type="button" onClick={handleSaveAndInvoice} disabled={saving}
                  className="flex items-center gap-1.5 text-xs bg-green-700 text-white px-3 py-1.5 rounded-lg hover:bg-green-800 disabled:opacity-50">
                  <Printer className="w-3.5 h-3.5" />저장 &amp; 인보이스 발행
                </button>
              )}
            </div>
          )}

          {/* 매입 상계 */}
          {form.disposition === 'offset_purchase' && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-3">
              <div className="text-xs font-semibold text-purple-800">매입 상계 — PO 연결</div>
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input value={poSearch} onChange={e => setPoSearch(e.target.value)} placeholder="PO번호 또는 공급업체명 검색" className="h-9 pl-8 text-xs" />
                  </div>
                </div>
                {poSearch && filteredPos.length > 0 && (
                  <div className="absolute z-50 mt-0.5 left-0 right-0 bg-background border rounded-lg shadow-xl max-h-44 overflow-y-auto">
                    {filteredPos.map(po => (
                      <button key={po.id} type="button" className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex justify-between" onClick={() => addOffsetPo(po)}>
                        <div><div className="font-medium">{po.businessId}</div><div className="text-muted-foreground">{po.supplierName}</div></div>
                        <div className="text-right shrink-0 ml-4">
                          <div>{po.totalAmount?.toLocaleString()} {po.currency}</div>
                          <div className="text-[10px] text-muted-foreground">{po.items?.[0]?.productName || ''}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
                        <Input value={item.description} onChange={e => setOffsetItems(prev => prev.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))} placeholder="항목" className="h-7 text-xs" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" value={item.qty} onChange={e => setOffsetItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: parseFloat(e.target.value) || 0 } : it))} className="h-7 text-xs" />
                      </div>
                      <div className="col-span-3">
                        <div className="flex gap-1">
                          <Input type="number" value={item.amount} onChange={e => setOffsetItems(prev => prev.map((it, i) => i === idx ? { ...it, amount: parseFloat(e.target.value) || 0 } : it))} className="h-7 text-xs flex-1" />
                          <select className="h-7 border rounded text-xs px-1 shrink-0" value={item.currency} onChange={e => setOffsetItems(prev => prev.map((it, i) => i === idx ? { ...it, currency: e.target.value } : it))}>
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button type="button" onClick={() => setOffsetItems(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-xs font-semibold px-1 pt-1 border-t">
                    <span>상계 합계</span>
                    <span className={cn(offsetTotal > effectiveCostAmount ? 'text-red-600' : 'text-purple-700')}>
                      {offsetTotal.toLocaleString()} / 원가 {effectiveCostAmount.toLocaleString()}
                      {offsetTotal === effectiveCostAmount && <Check className="inline w-3.5 h-3.5 ml-1 text-green-600" />}
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
                  <Input type="number" value={form.offsetRemaining} onChange={e => setForm(f => ({ ...f, offsetRemaining: e.target.value }))} placeholder={effectiveCostAmount.toString()} className="h-9" />
                </div>
              </div>
            </div>
          )}

          {/* FX 정산 */}
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
              {form.fxRateAtSettle && form.fxRateAtCost && form.billAmount && (() => {
                const diff = Math.round(parseFloat(form.billAmount) * (parseFloat(form.fxRateAtSettle) - parseFloat(form.fxRateAtCost)));
                return <div className={cn('text-xs font-medium', diff >= 0 ? 'text-green-700' : 'text-red-600')}>환차{diff >= 0 ? '익' : '손'}: {diff >= 0 ? '+' : ''}{diff.toLocaleString()}원</div>;
              })()}
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

          {/* 파일 첨부 */}
          <div className="border rounded-lg p-3">
            <FileSection recordId={record?.id} files={files} onChange={setFiles} />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-3.5 border-t">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          {!isNew && (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10"
              onClick={async () => {
                if (!confirm('삭제하시겠습니까?')) return;
                const res = await fetch(`/api/cost-records/${record!.id}`, { method: 'DELETE' });
                if (!res.ok) {
                  const err = await res.json();
                  alert(err.error || '삭제 실패');
                  return;
                }
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

function ForeignInvoiceModal({ records, onClose, onSave }: {
  records: CostRecord[]; onClose: () => void; onSave: () => void;
}) {
  const billable = records.filter(r => r.disposition === 'billable_foreign' && r.billStatus === 'unbilled');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [clientName, setClientName] = useState(billable[0]?.clientName || '');
  const [clientId, setClientId] = useState(billable[0]?.clientId || '');
  const [currency, setCurrency] = useState('USD');
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ForeignInvoiceItem[]>(() => {
    if (billable.length > 0) {
      return billable.map(r => ({
        costRecordId: r.id,
        description: r.description || COST_TYPE_LABELS[r.costType] || r.costType,
        qty: 1, unit: 'lot',
        unitPrice: r.billAmount || r.costAmount,
        vatIncluded: false,
        amount: r.billAmount || r.costAmount,
        currency: r.billCurrency || r.costCurrency,
      }));
    }
    return [{ description: '', qty: 1, unit: 'lot', unitPrice: 0, vatIncluded: false, amount: 0, currency: 'USD' }];
  });

  useEffect(() => {
    fetch('/api/companies').then(r => r.json()).then(d => {
      setCompanies((d.data || []).map((c: Record<string, unknown>) => ({ id: c.id as string, name: c.name as string })));
    }).catch(() => {});
  }, []);

  const companyOptions: AcOption[] = companies.map(c => ({ label: c.name, value: c.name, id: c.id }));

  const updateItem = (idx: number, field: keyof ForeignInvoiceItem, value: string | number | boolean) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const u = { ...item, [field]: value };
      if (field === 'qty' || field === 'unitPrice') {
        u.amount = Math.round((Number(u.qty) || 0) * (Number(u.unitPrice) || 0) * 100) / 100;
      }
      return u;
    }));
  };

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const vatTotal = items.reduce((s, i) => i.vatIncluded ? s + Math.round((i.amount / 1.1) * 0.1 * 100) / 100 : s, 0);

  const handleCreate = async () => {
    if (!clientName) { alert('거래처를 입력하세요.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/foreign-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId || undefined, clientName, currency,
          items: items.filter(i => i.description || i.amount > 0).map(i => ({ ...i, currency })),
          issuedDate, dueDate: dueDate || undefined, remark: remark || undefined, status: 'draft',
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      onSave();
      if (data.data?.id) window.open(`/costs/invoice-print?id=${data.data.id}`, '_blank');
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
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>거래처 (청구 대상)</label>
              <AcInput value={clientName} onChange={v => { setClientName(v); setClientId(''); }} options={companyOptions} placeholder="거래처명" onSelect={opt => { setClientName(opt.label); setClientId(opt.id || ''); }} />
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

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-muted-foreground">청구 내역</div>
              <button type="button" onClick={() => setItems(prev => [...prev, { description: '', qty: 1, unit: 'lot', unitPrice: 0, vatIncluded: false, amount: 0, currency }])} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />행 추가
              </button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left px-2.5 py-2 font-medium text-muted-foreground">내역 (Description)</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground w-12">수량</th>
                    <th className="px-2 py-2 font-medium text-muted-foreground w-14">단위</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground w-24">단가</th>
                    <th className="text-center px-2 py-2 font-medium text-muted-foreground w-14">VAT포함</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground w-24">금액</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1.5"><Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="내역 입력" className="h-7 text-xs" /></td>
                      <td className="px-2 py-1.5"><Input type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" /></td>
                      <td className="px-2 py-1.5"><Input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="lot" className="h-7 text-xs" /></td>
                      <td className="px-2 py-1.5"><Input type="number" value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" /></td>
                      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={item.vatIncluded} onChange={e => updateItem(idx, 'vatIncluded', e.target.checked)} className="accent-primary w-3.5 h-3.5" /></td>
                      <td className="px-2 py-1.5 text-right font-semibold">{(item.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-1 py-1.5 text-center"><button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40">
                  <tr className="border-t"><td colSpan={5} className="px-2.5 py-2 text-right text-xs font-medium text-muted-foreground">소계 (Subtotal)</td><td className="px-2 py-2 text-right font-semibold text-xs">{subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td></td></tr>
                  {vatTotal > 0 && <tr><td colSpan={5} className="px-2.5 py-1 text-right text-xs text-muted-foreground">VAT (10%)</td><td className="px-2 py-1 text-right text-xs">{vatTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td></td></tr>}
                  <tr className="border-t-2 font-bold"><td colSpan={5} className="px-2.5 py-2 text-right text-sm">TOTAL ({currency})</td><td className="px-2 py-2 text-right text-sm text-primary">{subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td></td></tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div>
            <label className={labelCls}>비고</label>
            <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="메모" className="h-9" />
          </div>
        </div>
        <div className="flex gap-2 px-5 py-3.5 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button className="flex-1" onClick={handleCreate} disabled={saving || !clientName}>
            {saving ? '생성 중...' : '인보이스 생성 + 출력'}
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
  const BILLABLE_DISPOSITIONS = new Set(['billable_domestic', 'billable_foreign', 'offset_purchase', 'selling_admin']);
  const unbilledBillable = filtered.filter(r => BILLABLE_DISPOSITIONS.has(r.disposition) && r.billStatus === 'unbilled').length;
  const offsetPending = filtered.filter(r => r.offsetStatus === 'pending' || r.offsetStatus === 'partial').length;
  const fxBillable = records.filter(r => r.disposition === 'billable_foreign' && r.billStatus === 'unbilled').length;

  const handleQuickDisposition = async (id: string, disposition: CostRecord['disposition']) => {
    await fetch(`/api/cost-records/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disposition }) });
    load();
  };

  const handleConfirmPayment = async (id: string) => {
    if (!confirm('입금 확인 처리하시겠습니까? billStatus를 수금완료로 변경합니다.')) return;
    const res = await fetch(`/api/cost-records/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billStatus: 'collected' }) });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '처리 실패');
    }
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
            {tab === 'invoices' && (
              <Button size="sm" className="h-8 text-xs" onClick={() => setInvoiceModal(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />인보이스 생성
              </Button>
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
                          <div className="flex gap-1.5 mt-0.5">
                            {r.disposition === 'offset_purchase' && (r.offsetItems?.length ?? 0) > 0 && (
                              <span className="text-[10px] text-purple-600">PO {r.offsetItems.length}건</span>
                            )}
                            {r.linkedSaleId && <span className="text-[10px] text-blue-600">매출연결</span>}
                            {(r.files?.length ?? 0) > 0 && <span className="text-[10px] text-slate-500"><Paperclip className="inline w-2.5 h-2.5" />{r.files.length}</span>}
                            {(r.lineItems?.length ?? 0) > 0 && <span className="text-[10px] text-orange-600">내역 {r.lineItems.length}건</span>}
                          </div>
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
                              <button onClick={() => handleQuickDisposition(r.id, 'internal')} className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded">내부</button>
                              <button onClick={() => handleQuickDisposition(r.id, 'billable_domestic')} className="text-[10px] px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">국내</button>
                              <button onClick={() => handleQuickDisposition(r.id, 'billable_foreign')} className="text-[10px] px-1.5 py-0.5 bg-green-100 hover:bg-green-200 text-green-700 rounded">외화</button>
                              <button onClick={() => handleQuickDisposition(r.id, 'offset_purchase')} className="text-[10px] px-1.5 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded">상계</button>
                              <button onClick={() => handleQuickDisposition(r.id, 'selling_admin')} className="text-[10px] px-1.5 py-0.5 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded">판관</button>
                            </div>
                          ) : (
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', disp?.color)}>{disp?.label}</span>
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
                          {(() => {
                            const statusDisp = getStatusDisplay(r.disposition, r.billStatus);
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span className={cn('text-xs font-medium', statusDisp.color)}>{statusDisp.label}</span>
                                {r.disposition === 'billable_foreign' && r.billStatus === 'invoiced' && (
                                  <button type="button"
                                    onClick={e => { e.stopPropagation(); handleConfirmPayment(r.id); }}
                                    className="text-[10px] px-1.5 py-0.5 bg-green-100 hover:bg-green-200 text-green-700 rounded border border-green-300 w-fit">
                                    입금확인
                                  </button>
                                )}
                                {r.offsetStatus !== 'none' && r.offsetStatus !== 'completed' && (
                                  <span className="text-[10px] text-purple-600">
                                    {r.offsetStatus === 'partial' ? `부분상계(잔:${r.offsetRemaining?.toLocaleString()})` : '상계예정'}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.fxGainLoss != null && r.fxGainLoss !== 0 ? (
                            <span className={cn('text-xs font-medium', r.fxGainLoss > 0 ? 'text-green-600' : 'text-red-500')}>
                              {r.fxGainLoss > 0 ? '+' : ''}{r.fxGainLoss.toLocaleString()}원
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.isAutoAllocated && <span className="text-[10px] text-blue-400">자동</span>}
                          {r.disposition === 'internal' && (
                            <button type="button" onClick={e => { e.stopPropagation(); window.open(`/costs/expense-print?id=${r.id}`, '_blank'); }} className="text-[10px] text-slate-400 hover:text-slate-700 ml-1" title="비용서 출력">
                              <Printer className="w-3 h-3" />
                            </button>
                          )}
                          {DETAIL_COST_TYPES.has(r.costType) && (
                            <button type="button" onClick={e => { e.stopPropagation(); window.open(`/costs/cert-print?id=${r.id}`, '_blank'); }} className="text-[10px] text-orange-400 hover:text-orange-700 ml-1" title="인보이스 출력">
                              <FileText className="w-3 h-3" />
                            </button>
                          )}
                          {r.notionId && <span className="text-[10px] text-gray-400 ml-1">N</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            <div className="p-4 space-y-2">
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
                      <button onClick={() => window.open(`/costs/invoice-print?id=${inv.id}`, '_blank')} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded">
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
        <CostModal record={editModal.record || null} onClose={() => setEditModal({ open: false })} onSave={() => { setEditModal({ open: false }); load(); }} />
      )}
      {invoiceModal && (
        <ForeignInvoiceModal records={records} onClose={() => setInvoiceModal(false)} onSave={() => { setInvoiceModal(false); load(); }} />
      )}
    </div>
  );
}
