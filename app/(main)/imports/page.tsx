'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  TruckIcon, Plus, Search, X, Loader2, Pencil, Trash2,
  FileText, File, Upload, Download, RefreshCw, CheckCircle2, AlertCircle, Info, Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Import, ImportDocument, ImportDocType, Shipment, Company } from '@/types';

// ── 상수 ──────────────────────────────────────────────────────────────────────
const STATUS_STEPS: { key: Import['status']; label: string }[] = [
  { key: 'in_progress', label: '입항' },
  { key: 'declared',    label: '신고' },
  { key: 'released',    label: '납세' },
  { key: 'completed',   label: '반출' },
];
const STATUS_COLOR: Record<Import['status'], string> = {
  in_progress: 'bg-blue-100 text-blue-700',
  declared:    'bg-yellow-100 text-yellow-700',
  released:    'bg-purple-100 text-purple-700',
  completed:   'bg-green-100 text-green-700',
};
const DOC_TYPE_LABEL: Record<ImportDocType, string> = {
  clearance_cert: '수입면장',
  tax_bill:       '납세고지서',
  co:             'C/O',
  inspection:     '검사결과서',
  other:          '기타',
};
const DOC_TYPE_COLOR: Record<ImportDocType, string> = {
  clearance_cert: 'bg-blue-100 text-blue-700',
  tax_bill:       'bg-orange-100 text-orange-700',
  co:             'bg-teal-100 text-teal-700',
  inspection:     'bg-purple-100 text-purple-700',
  other:          'bg-gray-100 text-gray-600',
};
const FTA_TYPES = ['한-중 FTA', 'RCEP', '한-EU FTA', '한-미 FTA', '한-ASEAN FTA', '한-베트남 FTA'];
const labelCls = 'text-xs font-medium text-muted-foreground mb-1 block';
const inputCls = 'w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

// ── 통관 단계 표시 ─────────────────────────────────────────────────────────────
function StatusSteps({ status }: { status: Import['status'] }) {
  const idx = STATUS_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center gap-0.5">
      {STATUS_STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className={cn('w-2 h-2 rounded-full', i <= idx ? 'bg-blue-500' : 'bg-gray-200')} />
          {i < STATUS_STEPS.length - 1 && (
            <div className={cn('w-3 h-px', i < idx ? 'bg-blue-500' : 'bg-gray-200')} />
          )}
        </div>
      ))}
      <span className={cn('ml-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full', STATUS_COLOR[status])}>
        {STATUS_STEPS[idx]?.label ?? status}
      </span>
    </div>
  );
}

// ── 모달 ──────────────────────────────────────────────────────────────────────
function ImportModal({
  item, shipments, onClose, onSave,
}: {
  item?: Import | null;
  shipments: Pick<Shipment, 'id' | 'businessId' | 'forwarderName' | 'pol' | 'pod' | 'etd'>[];
  onClose: () => void;
  onSave: () => void;
}) {
  type Tab = 'basic' | 'tax' | 'docs';
  const [tab, setTab] = useState<Tab>('basic');
  const [saving, setSaving] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateMsg, setRateMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [documents, setDocuments] = useState<ImportDocument[]>(item?.documents || []);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; docType: ImportDocType }[]>([]);
  const [uploadDocType, setUploadDocType] = useState<ImportDocType>('clearance_cert');
  const docFileRef = useRef<HTMLInputElement>(null);
  const savedIdRef = useRef<string | null>(item?.id || null);

  // 관세사 목록
  const [brokers, setBrokers] = useState<Company[]>([]);
  const [brokerMode, setBrokerMode] = useState<'select' | 'manual'>('select');

  // 연결된 선적 상세 (운임, C/O 서류, 화물 참조)
  const [linkedShipment, setLinkedShipment] = useState<Shipment | null>(null);
  const [shipmentLoading, setShipmentLoading] = useState(false);

  const [form, setForm] = useState({
    shipmentBusinessId: item?.shipmentBusinessId || '',
    shipmentId: item?.shipmentId || '',
    brokerName: item?.brokerName || '',
    declarationNo: item?.declarationNo || '',
    arrivalDate: item?.arrivalDate || '',
    declarationDate: item?.declarationDate || '',
    taxPaymentDate: item?.taxPaymentDate || '',
    releaseDate: item?.releaseDate || '',
    invoiceValue: item?.invoiceValue?.toString() || '',
    invoiceCurrency: item?.invoiceCurrency || 'USD',
    exchangeRate: item?.exchangeRate?.toString() || '',
    freightUsd: item?.freightUsd?.toString() || '',
    freightExchangeRate: item?.freightExchangeRate?.toString() || '',
    freightKrw: item?.freightKrw?.toString() || '',
    insuranceKrw: item?.insuranceKrw?.toString() || '',
    inspectionFee: item?.inspectionFee?.toString() || '',
    warehouseFee: item?.warehouseFee?.toString() || '',
    inlandFreight: item?.inlandFreight?.toString() || '',
    refundAmount: item?.refundAmount?.toString() || '',
    refundStatus: (item?.refundStatus || '없음') as '없음' | '신청' | '완료',
    hsCode: item?.hsCode || '',
    dutyRate: item?.dutyRate?.toString() || '',
    duty: item?.duty?.toString() || '',
    vat: item?.vat?.toString() || '',
    brokerFee: item?.brokerFee?.toString() || '',
    ftaApplicable: item?.ftaApplicable || false,
    ftaType: item?.ftaType || '',
    coStatus: (item?.coStatus || '미수령') as '미수령' | '수령' | '불필요',
    coNo: item?.coNo || '',
    inspectionType: item?.inspectionType || 'none' as 'none' | 'document' | 'physical',
    remark: item?.remark || '',
    status: item?.status || 'in_progress' as Import['status'],
  });

  // 관세사 목록 로드
  useEffect(() => {
    fetch('/api/companies?type=관세사')
      .then(r => r.json())
      .then(d => {
        if (d.data?.length) {
          setBrokers(d.data);
          // 기존 item의 brokerName이 목록에 없으면 manual 모드
          if (item?.brokerName && !d.data.find((b: Company) => b.name === item.brokerName)) {
            setBrokerMode('manual');
          }
        } else {
          setBrokerMode('manual');
        }
      })
      .catch(() => setBrokerMode('manual'));
  }, [item?.brokerName]);

  // 선적 선택 시 상세 로드
  const fetchLinkedShipment = useCallback(async (bizId: string) => {
    if (!bizId) { setLinkedShipment(null); return; }
    setShipmentLoading(true);
    try {
      const res = await fetch('/api/shipments');
      const d = await res.json();
      const found: Shipment | undefined = (d.data as Shipment[])?.find(s => s.businessId === bizId);
      setLinkedShipment(found || null);
      // 운임(USD) 자동입력
      if (found?.freightCost && found.freightCurrency === 'USD' && !form.freightUsd) {
        setForm(f => ({ ...f, freightUsd: String(found.freightCost) }));
      }
    } finally {
      setShipmentLoading(false);
    }
  }, [form.freightUsd]);

  useEffect(() => {
    if (form.shipmentBusinessId) fetchLinkedShipment(form.shipmentBusinessId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.shipmentBusinessId]);

  // 운임 자동계산: freightUsd × freightExchangeRate
  const freightExRate = parseFloat(form.freightExchangeRate || form.exchangeRate || '0');
  const freightKrwCalc = form.freightUsd ? Math.round(parseFloat(form.freightUsd) * freightExRate) : 0;

  // 실제 사용할 운임 KRW
  const effectiveFreightKrw = form.freightKrw ? parseFloat(form.freightKrw)
    : (freightKrwCalc || 0);

  // 과세가격 자동계산
  const invoiceKrw = parseFloat(form.invoiceValue || '0') * parseFloat(form.exchangeRate || '0');
  const customsValueCalc = Math.round(
    invoiceKrw + effectiveFreightKrw + parseFloat(form.insuranceKrw || '0')
  );
  const dutyCalc = Math.round(customsValueCalc * (parseFloat(form.dutyRate || '0') / 100));
  const vatCalc = Math.round((customsValueCalc + dutyCalc) * 0.1);

  // 기타비용 (과세 제외)
  const inspectionFeeVal = parseFloat(form.inspectionFee || '0');
  const brokerFeeVal = parseFloat(form.brokerFee || '0');
  const warehouseFeeVal = parseFloat(form.warehouseFee || '0');
  const inlandFreightVal = parseFloat(form.inlandFreight || '0');
  const otherCosts = inspectionFeeVal + brokerFeeVal + warehouseFeeVal + inlandFreightVal;

  // 총납부액
  const dutyFinal = parseFloat(form.duty || '0') || dutyCalc;
  const vatFinal = parseFloat(form.vat || '0') || vatCalc;
  const totalTax = dutyFinal + vatFinal + otherCosts;

  const fetchRate = async () => {
    setRateLoading(true);
    setRateMsg(null);
    try {
      const res = await fetch(`/api/imports/exchange-rate?currency=${form.invoiceCurrency}`);
      const d = await res.json();
      if (d.rate) {
        setForm(f => ({ ...f, exchangeRate: String(d.rate) }));
        setRateMsg({ text: `${d.source} (${d.weekCode}주): 1${form.invoiceCurrency} = ${d.rate.toLocaleString()}원`, ok: true });
      } else {
        setRateMsg({ text: d.error || '환율 조회 실패', ok: false });
      }
    } catch {
      setRateMsg({ text: '환율 조회 실패. 직접 입력하세요.', ok: false });
    } finally {
      setRateLoading(false);
    }
  };

  const uploadDocs = async (shpId: string, files: { file: File; docType: ImportDocType }[]) => {
    setDocUploading(true);
    try {
      const fd = new FormData();
      files.forEach(({ file }) => fd.append('files', file));
      fd.append('docType', files[0]?.docType || 'other');
      const res = await fetch(`/api/imports/${shpId}/documents`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setDocuments(prev => [...prev, ...d.data]);
    } catch (e) {
      console.error('[upload docs]', e);
    } finally {
      setDocUploading(false);
    }
  };

  const deleteDoc = async (docId: string) => {
    const id = savedIdRef.current;
    if (!id) return;
    await fetch(`/api/imports/${id}/documents?docId=${docId}`, { method: 'DELETE' });
    setDocuments(prev => prev.filter(d => d.id !== docId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shipmentBusinessId) return;
    setSaving(true);
    try {
      const linkedShp = shipments.find(s => s.businessId === form.shipmentBusinessId);
      const body = {
        ...form,
        shipmentId: linkedShp?.id || form.shipmentId || '',
        invoiceValue: form.invoiceValue ? Number(form.invoiceValue) : undefined,
        exchangeRate: form.exchangeRate ? Number(form.exchangeRate) : undefined,
        freightUsd: form.freightUsd ? Number(form.freightUsd) : undefined,
        freightExchangeRate: form.freightExchangeRate ? Number(form.freightExchangeRate) : undefined,
        freightKrw: form.freightKrw ? Number(form.freightKrw) : (freightKrwCalc || undefined),
        insuranceKrw: form.insuranceKrw ? Number(form.insuranceKrw) : undefined,
        customsValue: customsValueCalc || undefined,
        dutyRate: form.dutyRate ? Number(form.dutyRate) : undefined,
        duty: form.duty ? Number(form.duty) : (dutyCalc || undefined),
        vat: form.vat ? Number(form.vat) : (vatCalc || undefined),
        brokerFee: form.brokerFee ? Number(form.brokerFee) : undefined,
        inspectionFee: form.inspectionFee ? Number(form.inspectionFee) : undefined,
        warehouseFee: form.warehouseFee ? Number(form.warehouseFee) : undefined,
        inlandFreight: form.inlandFreight ? Number(form.inlandFreight) : undefined,
        refundAmount: form.refundAmount ? Number(form.refundAmount) : undefined,
        refundStatus: form.refundStatus,
      };

      let savedId = item?.id || null;
      if (item) {
        await fetch(`/api/imports/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        const res = await fetch('/api/imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await res.json();
        savedId = d.data?.id || null;
      }

      if (savedId) {
        savedIdRef.current = savedId;
        if (pendingFiles.length > 0) {
          await uploadDocs(savedId, pendingFiles);
          setPendingFiles([]);
        }
      }
      onSave();
    } finally { setSaving(false); }
  };

  // 선적 연결 시 C/O 서류 유무
  const hasCoDoc = linkedShipment?.documents?.some(d => d.docType === 'co');
  const hasInvoiceDoc = linkedShipment?.documents?.some(d => d.docType === 'invoice');

  const TABS: { key: Tab; label: string }[] = [
    { key: 'basic', label: '기본정보' },
    { key: 'tax',   label: '세금계산' },
    { key: 'docs',  label: `서류${documents.length + pendingFiles.length > 0 ? ` (${documents.length + pendingFiles.length})` : ''}` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">{item ? '통관 수정' : '통관 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          {TABS.map(t => (
            <button key={t.key} type="button"
              className={cn('px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
              onClick={() => setTab(t.key)}
            >{t.label}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* ── 기본정보 탭 ── */}
            {tab === 'basic' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>선적 * <span className="text-blue-500 font-normal">연결</span></label>
                    <input
                      list="shipment-list"
                      className={inputCls}
                      placeholder="SHP-2026-0001"
                      value={form.shipmentBusinessId}
                      required
                      onChange={e => {
                        const v = e.target.value;
                        const s = shipments.find(s => s.businessId === v);
                        setForm(f => ({ ...f, shipmentBusinessId: v, shipmentId: s?.id || f.shipmentId }));
                      }}
                    />
                    <datalist id="shipment-list">
                      {shipments.map(s => (
                        <option key={s.id} value={s.businessId}>
                          {s.businessId}{s.pol && s.pod ? ` (${s.pol}→${s.pod})` : ''}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className={labelCls}>상태</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Import['status'] }))} className={inputCls}>
                      {STATUS_STEPS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* 선적 연결 참고 패널 */}
                {shipmentLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> 선적 정보 로딩 중...
                  </div>
                )}
                {linkedShipment && !shipmentLoading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 text-xs">
                    <div className="font-medium text-blue-800 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      선적 참고 정보 ({linkedShipment.businessId})
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-blue-700">
                      {linkedShipment.blNo && (
                        <div><span className="text-blue-500">B/L:</span> {linkedShipment.blNo}</div>
                      )}
                      {linkedShipment.freightCost && (
                        <div>
                          <span className="text-blue-500">운임:</span>{' '}
                          {linkedShipment.freightCurrency || 'USD'} {linkedShipment.freightCost.toLocaleString()}
                          {linkedShipment.freightCurrency === 'USD' && (
                            <button type="button"
                              className="ml-1.5 text-blue-600 underline hover:text-blue-800"
                              onClick={() => setForm(f => ({ ...f, freightUsd: String(linkedShipment.freightCost) }))}>
                              세금탭에 적용
                            </button>
                          )}
                        </div>
                      )}
                      {linkedShipment.pol && linkedShipment.pod && (
                        <div><span className="text-blue-500">구간:</span> {linkedShipment.pol} → {linkedShipment.pod}</div>
                      )}
                      {linkedShipment.eta && (
                        <div><span className="text-blue-500">ETA:</span> {linkedShipment.eta}</div>
                      )}
                    </div>
                    {/* C/O 서류 힌트 */}
                    {hasCoDoc && (
                      <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded px-2 py-1.5 text-teal-700">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        선적에 C/O 서류가 첨부되어 있습니다. C/O 번호를 아래에 수동 입력하세요.
                      </div>
                    )}
                    {/* 인보이스 서류 힌트 */}
                    {hasInvoiceDoc && (
                      <div className="flex items-center gap-1.5 text-blue-600">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        선적에 인보이스 서류 있음 (세금탭에서 금액 확인 후 입력)
                        <a href={linkedShipment.documents.find(d => d.docType === 'invoice')?.url} target="_blank" rel="noopener noreferrer" className="underline ml-1">보기</a>
                      </div>
                    )}
                    {/* 화물 목록 */}
                    {linkedShipment.cargoItems?.length > 0 && (
                      <div className="space-y-0.5">
                        <div className="text-blue-500 font-medium">화물 목록</div>
                        {linkedShipment.cargoItems.map((c, i) => (
                          <div key={i} className="text-blue-700 pl-2">• {c.productName}{c.qty ? ` × ${c.qty}` : ''}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={cn(labelCls, 'mb-0')}>관세사</label>
                      {brokers.length > 0 && (
                        <button type="button" className="text-xs text-blue-500 hover:text-blue-700"
                          onClick={() => setBrokerMode(m => m === 'select' ? 'manual' : 'select')}>
                          {brokerMode === 'select' ? '직접 입력' : '목록에서 선택'}
                        </button>
                      )}
                    </div>
                    {brokerMode === 'select' && brokers.length > 0 ? (
                      <select value={form.brokerName} onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))} className={inputCls}>
                        <option value="">-- 선택 --</option>
                        {brokers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                      </select>
                    ) : (
                      <Input value={form.brokerName} onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))} placeholder="관세법인 대한" />
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>신고번호</label>
                    <Input value={form.declarationNo} onChange={e => setForm(f => ({ ...f, declarationNo: e.target.value }))} placeholder="12345-26-001234" />
                  </div>
                </div>

                {/* 단계별 날짜 */}
                <div className="bg-muted/30 rounded-lg p-3 space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">통관 단계별 날짜</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: '입항일', key: 'arrivalDate' },
                      { label: '신고일', key: 'declarationDate' },
                      { label: '납세일', key: 'taxPaymentDate' },
                      { label: '반출일', key: 'releaseDate' },
                    ].map(({ label, key }) => (
                      <div key={key}>
                        <label className={labelCls}>{label}</label>
                        <Input type="date" value={(form as Record<string, unknown>)[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>세관검사 유형</label>
                    <select value={form.inspectionType} onChange={e => setForm(f => ({ ...f, inspectionType: e.target.value as 'none' | 'document' | 'physical' }))} className={inputCls}>
                      <option value="none">없음</option>
                      <option value="document">서류검사</option>
                      <option value="physical">현품검사</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>C/O 상태</label>
                    <select value={form.coStatus} onChange={e => setForm(f => ({ ...f, coStatus: e.target.value as '미수령' | '수령' | '불필요' }))} className={inputCls}>
                      <option>미수령</option><option>수령</option><option>불필요</option>
                    </select>
                  </div>
                </div>

                {form.coStatus !== '불필요' && (
                  <div>
                    <label className={labelCls}>
                      C/O 번호
                      {hasCoDoc && (
                        <span className="ml-2 text-teal-600 font-normal">선적에 C/O 서류 있음 — 번호 확인 후 입력</span>
                      )}
                    </label>
                    <Input value={form.coNo} onChange={e => setForm(f => ({ ...f, coNo: e.target.value }))} placeholder="C/O 번호 입력 (파싱 불가 시 수동 입력)" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-2 cursor-pointer pb-1">
                      <input type="checkbox" checked={form.ftaApplicable} onChange={e => setForm(f => ({ ...f, ftaApplicable: e.target.checked }))} className="w-4 h-4" />
                      <span className="text-sm">FTA 적용</span>
                    </label>
                  </div>
                  {form.ftaApplicable && (
                    <div>
                      <label className={labelCls}>FTA 협정</label>
                      <select value={form.ftaType} onChange={e => setForm(f => ({ ...f, ftaType: e.target.value }))} className={inputCls}>
                        <option value="">선택</option>
                        {FTA_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelCls}>비고</label>
                  <Input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} placeholder="특이사항" />
                </div>
              </div>
            )}

            {/* ── 세금계산 탭 ── */}
            {tab === 'tax' && (
              <div className="space-y-4">

                {/* 인보이스 금액 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">① 인보이스 (과세가격 기준)</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className={labelCls}>
                        인보이스 금액
                        {hasInvoiceDoc && <span className="ml-2 text-blue-500 font-normal">선적 인보이스 참조</span>}
                      </label>
                      <Input type="number" value={form.invoiceValue} onChange={e => setForm(f => ({ ...f, invoiceValue: e.target.value }))} placeholder="15000" />
                    </div>
                    <div>
                      <label className={labelCls}>통화</label>
                      <select value={form.invoiceCurrency} onChange={e => setForm(f => ({ ...f, invoiceCurrency: e.target.value }))} className={inputCls}>
                        <option>USD</option><option>CNY</option><option>EUR</option><option>JPY</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={cn(labelCls, 'mb-0')}>과세환율 (원/{form.invoiceCurrency})</label>
                      <button type="button" onClick={fetchRate} disabled={rateLoading}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50">
                        {rateLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        관세청 환율 불러오기
                      </button>
                    </div>
                    <Input type="number" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} placeholder="1350" />
                    {rateMsg && (
                      <div className={cn('flex items-center gap-1.5 mt-1.5 text-xs', rateMsg.ok ? 'text-green-700' : 'text-red-600')}>
                        {rateMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                        {rateMsg.text}
                      </div>
                    )}
                  </div>
                </div>

                {/* 운임 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">② 운임 (과세가격 포함)</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>
                        운임 (USD)
                        {linkedShipment?.freightCost && linkedShipment.freightCurrency === 'USD' && (
                          <span className="ml-1 text-blue-500 font-normal">
                            선적: ${linkedShipment.freightCost.toLocaleString()}
                          </span>
                        )}
                      </label>
                      <Input type="number" value={form.freightUsd}
                        onChange={e => setForm(f => ({ ...f, freightUsd: e.target.value, freightKrw: '' }))}
                        placeholder="700" />
                    </div>
                    <div>
                      <label className={labelCls}>운임환율 (원/USD)
                        <span className="ml-1 text-muted-foreground font-normal text-[10px]">비워두면 과세환율 사용</span>
                      </label>
                      <Input type="number" value={form.freightExchangeRate}
                        onChange={e => setForm(f => ({ ...f, freightExchangeRate: e.target.value, freightKrw: '' }))}
                        placeholder={form.exchangeRate || '1350'} />
                    </div>
                  </div>
                  {freightKrwCalc > 0 && !form.freightKrw && (
                    <div className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1.5">
                      운임 자동환산: ${form.freightUsd} × {freightExRate.toLocaleString()}원 = <strong>{freightKrwCalc.toLocaleString()}원</strong>
                      <span className="text-muted-foreground ml-1">(아래에서 직접 입력 시 우선 적용)</span>
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>운임 KRW (직접 입력 시 우선 적용)</label>
                    <Input type="number" value={form.freightKrw}
                      onChange={e => setForm(f => ({ ...f, freightKrw: e.target.value }))}
                      placeholder={freightKrwCalc ? String(freightKrwCalc) : '850000'} />
                  </div>
                </div>

                {/* 보험료 */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">③ 보험료 (과세가격 포함)</div>
                  <Input type="number" value={form.insuranceKrw}
                    onChange={e => setForm(f => ({ ...f, insuranceKrw: e.target.value }))}
                    placeholder="50000 (원)" />
                </div>

                {/* 과세가격 자동계산 표시 */}
                {customsValueCalc > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
                    <div className="font-medium text-blue-800">과세가격 (CIF) 자동계산</div>
                    <div className="text-blue-700 space-y-0.5">
                      <div>인보이스: {parseFloat(form.invoiceValue || '0').toLocaleString()} {form.invoiceCurrency} × {parseFloat(form.exchangeRate || '0').toLocaleString()}원 = {Math.round(invoiceKrw).toLocaleString()}원</div>
                      {effectiveFreightKrw > 0 && <div>운임: {effectiveFreightKrw.toLocaleString()}원</div>}
                      {parseFloat(form.insuranceKrw || '0') > 0 && <div>보험료: {parseFloat(form.insuranceKrw).toLocaleString()}원</div>}
                    </div>
                    <div className="text-blue-900 font-bold text-sm border-t border-blue-200 pt-1 mt-1">과세가격 = {customsValueCalc.toLocaleString()}원</div>
                  </div>
                )}

                {/* 관세 / 부가세 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">세율 & 관세 · 부가세</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>HS Code</label>
                      <Input value={form.hsCode} onChange={e => setForm(f => ({ ...f, hsCode: e.target.value }))} placeholder="9405.10-0000" />
                    </div>
                    <div>
                      <label className={labelCls}>관세율 (%)</label>
                      <Input type="number" step="0.1" value={form.dutyRate} onChange={e => setForm(f => ({ ...f, dutyRate: e.target.value }))} placeholder="8" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>
                        관세 (원)
                        {dutyCalc > 0 && !form.duty && <span className="text-blue-500 ml-1">≈{dutyCalc.toLocaleString()}</span>}
                      </label>
                      <Input type="number" value={form.duty} onChange={e => setForm(f => ({ ...f, duty: e.target.value }))} placeholder={dutyCalc ? String(dutyCalc) : '0'} />
                    </div>
                    <div>
                      <label className={labelCls}>
                        부가세 (원)
                        {vatCalc > 0 && !form.vat && <span className="text-blue-500 ml-1">≈{vatCalc.toLocaleString()}</span>}
                      </label>
                      <Input type="number" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} placeholder={vatCalc ? String(vatCalc) : '0'} />
                    </div>
                  </div>
                </div>

                {/* 기타비용 (과세가격 외, 부가세 비해당) */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    기타비용 <span className="font-normal text-muted-foreground normal-case">(부가세 비해당)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>
                        세관검사비 (원)
                        {form.inspectionType === 'none' && <span className="ml-1 text-muted-foreground font-normal">(검사 없음)</span>}
                      </label>
                      <Input type="number" value={form.inspectionFee}
                        onChange={e => setForm(f => ({ ...f, inspectionFee: e.target.value }))}
                        placeholder="검사 발생 시 입력"
                        disabled={form.inspectionType === 'none'} />
                    </div>
                    <div>
                      <label className={labelCls}>통관비 / 관세사 수수료 (원)</label>
                      <Input type="number" value={form.brokerFee} onChange={e => setForm(f => ({ ...f, brokerFee: e.target.value }))} placeholder="150000" />
                    </div>
                    <div>
                      <label className={labelCls}>창고비 (원)</label>
                      <Input type="number" value={form.warehouseFee} onChange={e => setForm(f => ({ ...f, warehouseFee: e.target.value }))} placeholder="0" />
                    </div>
                    <div>
                      <label className={labelCls}>내륙운송비 (원)</label>
                      <Input type="number" value={form.inlandFreight} onChange={e => setForm(f => ({ ...f, inlandFreight: e.target.value }))} placeholder="0" />
                    </div>
                  </div>
                </div>

                {/* 환급 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">환급</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>환급액 (원)</label>
                      <Input type="number" value={form.refundAmount} onChange={e => setForm(f => ({ ...f, refundAmount: e.target.value }))} placeholder="FTA 사후 환급 등" />
                    </div>
                    <div>
                      <label className={labelCls}>환급 상태</label>
                      <select value={form.refundStatus} onChange={e => setForm(f => ({ ...f, refundStatus: e.target.value as '없음' | '신청' | '완료' }))} className={inputCls}>
                        <option value="없음">없음</option>
                        <option value="신청">신청</option>
                        <option value="완료">완료</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 총납부 요약 */}
                {(customsValueCalc > 0 || totalTax > 0) && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">관세</span>
                      <span>{(dutyFinal || 0).toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">부가세</span>
                      <span>{(vatFinal || 0).toLocaleString()}원</span>
                    </div>
                    {inspectionFeeVal > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">세관검사비</span>
                        <span>{inspectionFeeVal.toLocaleString()}원</span>
                      </div>
                    )}
                    {brokerFeeVal > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">통관비(관세사)</span>
                        <span>{brokerFeeVal.toLocaleString()}원</span>
                      </div>
                    )}
                    {warehouseFeeVal > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">창고비</span>
                        <span>{warehouseFeeVal.toLocaleString()}원</span>
                      </div>
                    )}
                    {inlandFreightVal > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">내륙운송비</span>
                        <span>{inlandFreightVal.toLocaleString()}원</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center border-t border-border pt-1.5 mt-1">
                      <span className="font-semibold">총 납부액</span>
                      <span className="text-lg font-bold text-red-600">{totalTax.toLocaleString()}원</span>
                    </div>
                    {parseFloat(form.refundAmount || '0') > 0 && (
                      <div className="flex justify-between items-center text-green-700">
                        <span className="text-sm">환급 후 실납부</span>
                        <span className="font-bold">{(totalTax - parseFloat(form.refundAmount || '0')).toLocaleString()}원</span>
                      </div>
                    )}
                  </div>
                )}

                {/* FTA 절감액 */}
                {form.ftaApplicable && dutyCalc > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                    FTA 미적용 시 관세 ≈ {Math.round(customsValueCalc * 0.08).toLocaleString()}원 (8% 기준) →
                    <span className="font-bold ml-1">절감 ≈ {Math.max(0, Math.round(customsValueCalc * 0.08) - dutyCalc).toLocaleString()}원</span>
                  </div>
                )}
              </div>
            )}

            {/* ── 서류 탭 ── */}
            {tab === 'docs' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value as ImportDocType)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                    {(Object.entries(DOC_TYPE_LABEL) as [ImportDocType, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed rounded-lg cursor-pointer hover:bg-muted text-muted-foreground hover:text-foreground">
                    <input ref={docFileRef} type="file" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
                      onChange={e => {
                        if (!e.target.files?.length) return;
                        const files = Array.from(e.target.files);
                        const id = savedIdRef.current;
                        if (id) {
                          uploadDocs(id, files.map(f => ({ file: f, docType: uploadDocType }))).then(() => {});
                        } else {
                          setPendingFiles(prev => [...prev, ...files.map(f => ({ file: f, docType: uploadDocType }))]);
                        }
                        e.target.value = '';
                      }}
                    />
                    {docUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    파일 업로드
                  </label>
                </div>

                {/* 대기 파일 */}
                {pendingFiles.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-blue-600 font-medium">저장 시 업로드 예정 ({pendingFiles.length}개)</div>
                    {pendingFiles.map(({ file, docType }, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                        <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]', DOC_TYPE_COLOR[docType])}>{DOC_TYPE_LABEL[docType]}</span>
                        <button type="button" onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))}><X className="w-3 h-3 text-gray-400 hover:text-red-500" /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 업로드된 서류 */}
                {documents.length > 0 ? (
                  <div className="space-y-1.5">
                    {documents.map(doc => (
                      <div key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg border border-border">
                        {doc.originalName.match(/\.(pdf)$/i)
                          ? <FileText className="w-4 h-4 text-red-500 shrink-0" />
                          : doc.originalName.match(/\.(jpe?g|png)$/i)
                            ? <File className="w-4 h-4 text-yellow-500 shrink-0" />
                            : <File className="w-4 h-4 text-green-600 shrink-0" />}
                        <span className="flex-1 text-xs truncate" title={doc.originalName}>{doc.originalName}</span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0', DOC_TYPE_COLOR[doc.docType])}>{DOC_TYPE_LABEL[doc.docType]}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{doc.size ? `${(doc.size / 1024).toFixed(0)}KB` : ''}</span>
                        {(doc.docType === 'clearance_cert' || doc.docType === 'tax_bill') && doc.originalName.match(/\.pdf$/i) && savedIdRef.current && (
                          <button type="button" title="PDF 자동 파싱"
                            className="text-purple-500 hover:text-purple-700 shrink-0"
                            onClick={async () => {
                              const id = savedIdRef.current;
                              if (!id) return;
                              const res = await fetch(`/api/imports/${id}/parse-doc`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filename: doc.filename, docType: doc.docType }),
                              });
                              const d = await res.json();
                              if (d.data && Object.keys(d.data).length > 0) {
                                const e = d.data;
                                setForm(f => ({
                                  ...f,
                                  ...(e.declarationNo && !f.declarationNo ? { declarationNo: e.declarationNo } : {}),
                                  ...(e.hsCode && !f.hsCode ? { hsCode: e.hsCode } : {}),
                                  ...(e.customsValue ? {} : {}),
                                  ...(e.duty && !f.duty ? { duty: String(e.duty) } : {}),
                                  ...(e.vat && !f.vat ? { vat: String(e.vat) } : {}),
                                  ...(e.taxPaymentDate && !f.taxPaymentDate ? { taxPaymentDate: e.taxPaymentDate } : {}),
                                }));
                                alert(`파싱 완료: ${Object.keys(e).join(', ')}`);
                              } else {
                                alert('파싱 결과 없음. 수동 입력하세요.');
                              }
                            }}>
                            <Wand2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 shrink-0">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button type="button" onClick={() => deleteDoc(doc.id)} className="text-red-400 hover:text-red-600 shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    서류를 업로드하세요 (수입면장, 납세고지서, C/O 등)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 p-4 border-t sticky bottom-0 bg-background shrink-0">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving || !form.shipmentBusinessId}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '저장' : '등록')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function ImportsPage() {
  const [imports, setImports] = useState<Import[]>([]);
  const [shipments, setShipments] = useState<Pick<Shipment, 'id' | 'businessId' | 'forwarderName' | 'pol' | 'pod' | 'etd'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Import['status'] | 'all'>('all');
  const [modal, setModal] = useState<{ open: boolean; item?: Import | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const [impRes, shpRes] = await Promise.all([
      fetch('/api/imports').then(r => r.json()),
      fetch('/api/shipments').then(r => r.json()),
    ]);
    if (impRes.data) setImports(impRes.data);
    if (shpRes.data) setShipments(shpRes.data.map((s: Shipment) => ({
      id: s.id, businessId: s.businessId, forwarderName: s.forwarderName,
      pol: s.pol, pod: s.pod, etd: s.etd,
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('통관 내역을 삭제하시겠습니까?')) return;
    await fetch(`/api/imports/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = imports.filter(i => {
    const matchStatus = statusFilter === 'all' || i.status === statusFilter;
    const matchSearch = !search ||
      i.businessId.includes(search) ||
      i.shipmentBusinessId.includes(search) ||
      (i.declarationNo ?? '').includes(search) ||
      (i.brokerName ?? '').includes(search);
    return matchStatus && matchSearch;
  });

  const totalDuty = filtered.reduce((s, i) => s + (i.duty || 0), 0);
  const totalVat  = filtered.reduce((s, i) => s + (i.vat  || 0), 0);
  const totalOther = filtered.reduce((s, i) => s + (i.brokerFee || 0) + (i.inspectionFee || 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="수입통관" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">

        {/* 필터 / 검색 / 등록 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="통관번호, 선적, 관세사 검색" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">전체 단계</option>
            {STATUS_STEPS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <a href="/api/imports/export" className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-muted transition-colors">
            <Download className="w-4 h-4" /><span className="hidden sm:inline">내보내기</span>
          </a>
          <Button size="sm" className="h-9 gap-1" onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">통관 등록</span>
          </Button>
        </div>

        {/* 요약 */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '관세 합계', value: totalDuty, color: 'text-orange-600' },
              { label: '부가세 합계', value: totalVat, color: 'text-purple-600' },
              { label: '기타비용', value: totalOther, color: 'text-gray-700' },
              { label: '총 납부액', value: totalDuty + totalVat + totalOther, color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-lg px-4 py-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className={cn('text-base font-bold', color)}>{value.toLocaleString()}원</div>
              </div>
            ))}
          </div>
        )}

        {/* 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <TruckIcon className="w-10 h-10 mx-auto mb-2 opacity-20" />
            통관 내역이 없습니다.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">통관번호</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">선적</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">관세사</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">신고번호</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">관세</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">부가세</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">총납부</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">단계</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(imp => {
                  const total = (imp.duty || 0) + (imp.vat || 0) + (imp.brokerFee || 0) + (imp.inspectionFee || 0);
                  return (
                    <tr key={imp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{imp.businessId}</td>
                      <td className="px-4 py-3 text-xs font-medium">{imp.shipmentBusinessId}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{imp.brokerName || '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{imp.declarationNo || '-'}</td>
                      <td className="px-4 py-3 text-right text-xs">{imp.duty ? imp.duty.toLocaleString() + '원' : '-'}</td>
                      <td className="px-4 py-3 text-right text-xs">{imp.vat ? imp.vat.toLocaleString() + '원' : '-'}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-red-600">{total > 0 ? total.toLocaleString() + '원' : '-'}</td>
                      <td className="px-4 py-3"><StatusSteps status={imp.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {(imp.documents?.length ?? 0) > 0 && (
                            <span className="text-xs text-muted-foreground mr-1">📎{imp.documents!.length}</span>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: imp })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(imp.id)}>
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
        <ImportModal
          item={modal.item}
          shipments={shipments}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }}
        />
      )}
    </div>
  );
}
