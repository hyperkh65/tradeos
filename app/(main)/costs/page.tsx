'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus, X, FileText, Download, Check, AlertCircle, Clock, ChevronDown } from 'lucide-react';
import type { CostRecord } from '@/app/api/cost-records/route';
import type { ForeignInvoice } from '@/app/api/foreign-invoices/route';

// ── 상수 ────────────────────────────────────────────────────────────────────

const COST_TYPE_LABELS: Record<string, string> = {
  duty: '관세', vat: '수입부가세', customs_broker: '관세사비',
  inspection: '세관검사비', warehouse: '창고료(장치료)',
  demurrage: '체화료(DEM)', detention: '지체료(DET)',
  inland_freight: '내륙운송비', ocean_freight: '해상운임',
  air_freight: '항공운임', certification: '인증비', other: '기타',
};

const DISPOSITION_LABELS: Record<string, { label: string; color: string }> = {
  pending:            { label: '미결정',      color: 'bg-gray-100 text-gray-600' },
  internal:           { label: '내부비용',    color: 'bg-slate-100 text-slate-700' },
  billable_domestic:  { label: '국내 매출',   color: 'bg-blue-100 text-blue-700' },
  billable_foreign:   { label: '외화 청구',   color: 'bg-green-100 text-green-700' },
  offset_purchase:    { label: '매입 상계',   color: 'bg-purple-100 text-purple-700' },
};

const BILL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  unbilled:  { label: '미청구',    color: 'text-gray-500' },
  invoiced:  { label: '청구완료',  color: 'text-blue-600' },
  collected: { label: '수금완료',  color: 'text-green-600' },
  offset:    { label: '상계완료',  color: 'text-purple-600' },
  waived:    { label: '면제',      color: 'text-gray-400' },
};

const CAUSE_TYPE_LABELS: Record<string, string> = {
  schedule: '일정', client_fault: '고객귀책', our_fault: '당사귀책',
  force_majeure: '불가항력', port_congestion: '항구혼잡',
};

const CURRENCIES = ['KRW', 'USD', 'CNY', 'EUR', 'JPY'];
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';
const inputCls = 'w-full h-9 rounded-md border border-input bg-background px-3 text-sm';

// ── 비용 상세/편집 모달 ────────────────────────────────────────────────────

function CostModal({
  record, onClose, onSave,
}: { record: CostRecord | null; onClose: () => void; onSave: () => void }) {
  const isNew = !record;
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
    importBusinessId: record?.importBusinessId || '',
    shipmentBusinessId: record?.shipmentBusinessId || '',
  });
  const [saving, setSaving] = useState(false);

  const costKrw = form.costCurrency === 'KRW'
    ? parseFloat(form.costAmount || '0')
    : parseFloat(form.costAmount || '0') * parseFloat(form.fxRateAtCost || '1');

  const billAmountFinal = parseFloat(form.billAmount || form.costAmount || '0');
  const margin = billAmountFinal - parseFloat(form.costAmount || '0');

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
        fxRateAtSettle: form.fxRateAtSettle ? parseFloat(form.fxRateAtSettle) : undefined,
        settledAt: form.settledAt || undefined,
        remark: form.remark || undefined,
        clientName: form.clientName || undefined,
        importBusinessId: form.importBusinessId || undefined,
        shipmentBusinessId: form.shipmentBusinessId || undefined,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="font-semibold text-sm">{isNew ? '비용 등록' : '비용 수정'}</h2>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 자동 생성 배지 */}
          {record?.isAutoAllocated && (
            <div className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              통관 입력 시 자동 생성된 비용입니다. 처리 방향만 변경 가능합니다.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>비용 유형</label>
              <select className={inputCls} value={form.costType} onChange={e => setForm(f => ({ ...f, costType: e.target.value }))}>
                {Object.entries(COST_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>설명</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="비용 설명" />
            </div>
          </div>

          {/* 원가 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold text-slate-700">원가 (실제 지출)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>금액</label>
                <Input type="number" value={form.costAmount} onChange={e => setForm(f => ({ ...f, costAmount: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label className={labelCls}>통화</label>
                <select className={inputCls} value={form.costCurrency} onChange={e => setForm(f => ({ ...f, costCurrency: e.target.value, billCurrency: e.target.value }))}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>환율 (발생 시)</label>
                <Input type="number" value={form.fxRateAtCost} onChange={e => setForm(f => ({ ...f, fxRateAtCost: e.target.value }))} placeholder="1" disabled={form.costCurrency === 'KRW'} />
              </div>
            </div>
            {form.costCurrency !== 'KRW' && costKrw > 0 && (
              <div className="text-xs text-slate-600">원화 환산: <span className="font-medium">{Math.round(costKrw).toLocaleString()}원</span></div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>발생일</label>
                <Input type="date" value={form.incurredDate} onChange={e => setForm(f => ({ ...f, incurredDate: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>연결 선적/통관</label>
                <Input value={form.importBusinessId || form.shipmentBusinessId} onChange={e => setForm(f => ({ ...f, importBusinessId: e.target.value }))} placeholder="IMP-2026-0001" />
              </div>
            </div>
          </div>

          {/* 처리 방향 */}
          <div>
            <label className={labelCls}>처리 방향</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(DISPOSITION_LABELS).map(([k, { label, color }]) => (
                <button key={k} type="button"
                  onClick={() => setForm(f => ({ ...f, disposition: k as CostRecord['disposition'] }))}
                  className={cn('text-xs px-3 py-2 rounded-lg border text-left transition-all', form.disposition === k ? 'border-primary ring-1 ring-primary ' + color : 'border-border hover:bg-muted')}>
                  <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1.5', color)}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 청구 정보 (내부비용이 아닐 때) */}
          {form.disposition !== 'internal' && form.disposition !== 'pending' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
              <div className="text-xs font-semibold text-green-800">청구 정보</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>청구 금액</label>
                  <Input type="number" value={form.billAmount} onChange={e => setForm(f => ({ ...f, billAmount: e.target.value }))} placeholder={form.costAmount || '원가와 동일'} />
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
              <div>
                <label className={labelCls}>거래처명</label>
                <Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="청구 대상 거래처" />
              </div>
              {form.billAmount && parseFloat(form.billAmount) !== parseFloat(form.costAmount || '0') && (
                <div className={cn('text-xs font-medium', margin > 0 ? 'text-green-700' : 'text-red-600')}>
                  마진: {margin >= 0 ? '+' : ''}{margin.toLocaleString(undefined, { maximumFractionDigits: 2 })} {form.billCurrency}
                  {form.costCurrency !== 'KRW' && margin !== 0 && (
                    <span className="ml-2 text-muted-foreground">(환율 변동에 따라 원화 실현마진 달라짐)</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 상계 처리 */}
          {form.disposition === 'offset_purchase' && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-purple-800">상계 처리</div>
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
                  <Input type="number" value={form.offsetRemaining} onChange={e => setForm(f => ({ ...f, offsetRemaining: e.target.value }))} placeholder={form.costAmount} />
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
                  <Input type="number" value={form.fxRateAtSettle} onChange={e => setForm(f => ({ ...f, fxRateAtSettle: e.target.value }))} placeholder="1385" />
                </div>
                <div>
                  <label className={labelCls}>수금일</label>
                  <Input type="date" value={form.settledAt} onChange={e => setForm(f => ({ ...f, settledAt: e.target.value }))} />
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
            <Input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} placeholder="메모" />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-3.5 border-t">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
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
  const [selected, setSelected] = useState<Set<string>>(new Set(billable.map(r => r.id)));
  const [currency, setCurrency] = useState('USD');
  const [clientName, setClientName] = useState(billable[0]?.clientName || '');
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [fxRate, setFxRate] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedRecords = billable.filter(r => selected.has(r.id));
  const total = selectedRecords.reduce((s, r) => s + (r.billAmount || r.costAmount), 0);

  const handleCreate = async () => {
    if (selectedRecords.length === 0) { alert('항목을 선택하세요.'); return; }
    setSaving(true);
    try {
      const items = selectedRecords.map(r => ({
        costRecordId: r.id,
        description: r.description || COST_TYPE_LABELS[r.costType] || r.costType,
        amount: r.billAmount || r.costAmount,
        currency,
      }));
      const res = await fetch('/api/foreign-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, currency, items, issuedDate, fxRate: fxRate ? parseFloat(fxRate) : undefined, remark }),
      });
      if (!res.ok) throw new Error('저장 실패');
      onSave();
    } catch (e) { alert(`오류: ${e}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="font-semibold text-sm">외화 인보이스 생성</h2>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>거래처명</label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="청구 대상 거래처" />
            </div>
            <div>
              <label className={labelCls}>청구 통화</label>
              <select className={inputCls} value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>발행일</label>
              <Input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>참고 환율</label>
              <Input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} placeholder="1385" />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">포함할 비용 항목 ({billable.length}건)</div>
            {billable.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">외화 청구 예정 미청구 항목이 없습니다.</div>
            ) : billable.map(r => (
              <label key={r.id} className={cn('flex items-center gap-3 p-2.5 rounded-lg border mb-1.5 cursor-pointer', selected.has(r.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')}>
                <input type="checkbox" checked={selected.has(r.id)} onChange={e => {
                  const s = new Set(selected);
                  e.target.checked ? s.add(r.id) : s.delete(r.id);
                  setSelected(s);
                }} className="accent-primary" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{r.description || COST_TYPE_LABELS[r.costType]}</div>
                  <div className="text-[10px] text-muted-foreground">{r.importBusinessId || r.shipmentBusinessId}</div>
                </div>
                <div className="text-xs font-medium text-right shrink-0">
                  {(r.billAmount || r.costAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.billCurrency || r.costCurrency}
                </div>
              </label>
            ))}
          </div>

          <div className="flex justify-between items-center text-sm font-semibold border-t pt-3">
            <span>합계</span>
            <span>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}</span>
          </div>

          <div>
            <label className={labelCls}>비고</label>
            <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="메모" />
          </div>
        </div>
        <div className="flex gap-2 px-5 py-3.5 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button className="flex-1" onClick={handleCreate} disabled={saving || selectedRecords.length === 0}>
            {saving ? '생성 중...' : `인보이스 생성 (${selectedRecords.length}건)`}
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

  // 필터
  const [filterDisposition, setFilterDisposition] = useState<string>('all');
  const [filterBillStatus, setFilterBillStatus] = useState<string>('all');
  const [filterCostType, setFilterCostType] = useState<string>('all');
  const [search, setSearch] = useState('');

  // 모달
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

  // 집계
  const totalCostKrw = filtered.reduce((s, r) => s + (r.costAmountKrw || r.costAmount), 0);
  const pendingCount = filtered.filter(r => r.disposition === 'pending').length;
  const unbilledBillable = filtered.filter(r => r.disposition !== 'internal' && r.disposition !== 'pending' && r.billStatus === 'unbilled').length;
  const offsetPending = filtered.filter(r => r.offsetStatus === 'pending' || r.offsetStatus === 'partial').length;
  const fxBillable = filtered.filter(r => r.disposition === 'billable_foreign' && r.billStatus === 'unbilled').length;

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
                          <div className="font-medium truncate max-w-[200px]">{r.description || '-'}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {[r.importBusinessId, r.shipmentBusinessId, r.clientName].filter(Boolean).join(' · ')}
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
                            <div className="text-[10px] text-purple-600">{r.offsetStatus === 'pending' ? '상계예정' : r.offsetStatus === 'partial' ? '부분상계' : '완료'}</div>
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            /* 외화 인보이스 탭 */
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
                          <span>{item.description}</span>
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
