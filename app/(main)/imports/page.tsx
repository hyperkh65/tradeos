'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  TruckIcon, Plus, Search, X, Loader2, Pencil, Trash2,
  FileText, File, Upload, Download, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import type { Import, ImportDocument, ImportDocType, Shipment } from '@/types';

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
          <div className={cn(
            'w-2 h-2 rounded-full',
            i <= idx ? 'bg-blue-500' : 'bg-gray-200',
          )} />
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
    freightKrw: item?.freightKrw?.toString() || '',
    insuranceKrw: item?.insuranceKrw?.toString() || '',
    hsCode: item?.hsCode || '',
    dutyRate: item?.dutyRate?.toString() || '',
    duty: item?.duty?.toString() || '',
    vat: item?.vat?.toString() || '',
    brokerFee: item?.brokerFee?.toString() || '',
    ftaApplicable: item?.ftaApplicable || false,
    ftaType: item?.ftaType || '',
    coStatus: item?.coStatus || '미수령',
    coNo: item?.coNo || '',
    inspectionType: item?.inspectionType || 'none',
    remark: item?.remark || '',
    status: item?.status || 'in_progress',
  });

  // 과세가격 / 관세 / 부가세 자동계산
  const invoiceKrw = parseFloat(form.invoiceValue || '0') * parseFloat(form.exchangeRate || '0');
  const customsValueCalc = Math.round(invoiceKrw + parseFloat(form.freightKrw || '0') + parseFloat(form.insuranceKrw || '0'));
  const dutyCalc = Math.round(customsValueCalc * (parseFloat(form.dutyRate || '0') / 100));
  const vatCalc = Math.round((customsValueCalc + dutyCalc) * 0.1);
  const totalTax = (parseFloat(form.duty || '0') || dutyCalc) + (parseFloat(form.vat || '0') || vatCalc) + parseFloat(form.brokerFee || '0');

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
      const linkedShipment = shipments.find(s => s.businessId === form.shipmentBusinessId);
      const body = {
        ...form,
        shipmentId: linkedShipment?.id || form.shipmentId || '',
        invoiceValue: form.invoiceValue ? Number(form.invoiceValue) : undefined,
        exchangeRate: form.exchangeRate ? Number(form.exchangeRate) : undefined,
        freightKrw: form.freightKrw ? Number(form.freightKrw) : undefined,
        insuranceKrw: form.insuranceKrw ? Number(form.insuranceKrw) : undefined,
        customsValue: customsValueCalc || undefined,
        dutyRate: form.dutyRate ? Number(form.dutyRate) : undefined,
        duty: form.duty ? Number(form.duty) : (dutyCalc || undefined),
        vat: form.vat ? Number(form.vat) : (vatCalc || undefined),
        brokerFee: form.brokerFee ? Number(form.brokerFee) : undefined,
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

  const TABS: { key: Tab; label: string }[] = [
    { key: 'basic', label: '기본정보' },
    { key: 'tax',   label: '세금계산' },
    { key: 'docs',  label: `서류 ${documents.length + pendingFiles.length > 0 ? `(${documents.length + pendingFiles.length})` : ''}` },
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>관세사</label>
                    <Input value={form.brokerName} onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))} placeholder="관세법인 대한" />
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
                    <label className={labelCls}>세관검사</label>
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

                {form.coStatus === '수령' && (
                  <div>
                    <label className={labelCls}>C/O 번호</label>
                    <Input value={form.coNo} onChange={e => setForm(f => ({ ...f, coNo: e.target.value }))} placeholder="C/O 번호 입력" />
                  </div>
                )}

                <div>
                  <label className={labelCls}>비고</label>
                  <Input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} placeholder="특이사항" />
                </div>
              </div>
            )}

            {/* ── 세금계산 탭 ── */}
            {tab === 'tax' && (
              <div className="space-y-4">
                {/* 인보이스 + 환율 */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className={labelCls}>인보이스 금액</label>
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>운임 (원)</label>
                    <Input type="number" value={form.freightKrw} onChange={e => setForm(f => ({ ...f, freightKrw: e.target.value }))} placeholder="850000" />
                  </div>
                  <div>
                    <label className={labelCls}>보험료 (원)</label>
                    <Input type="number" value={form.insuranceKrw} onChange={e => setForm(f => ({ ...f, insuranceKrw: e.target.value }))} placeholder="50000" />
                  </div>
                </div>

                {/* 과세가격 자동계산 표시 */}
                {customsValueCalc > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
                    <div className="font-medium text-blue-800">과세가격 자동계산</div>
                    <div className="text-blue-700">
                      인보이스 {parseFloat(form.invoiceValue || '0').toLocaleString()} {form.invoiceCurrency}
                      × {parseFloat(form.exchangeRate || '0').toLocaleString()}원
                      {parseFloat(form.freightKrw || '0') > 0 && ` + 운임 ${parseFloat(form.freightKrw).toLocaleString()}원`}
                      {parseFloat(form.insuranceKrw || '0') > 0 && ` + 보험 ${parseFloat(form.insuranceKrw).toLocaleString()}원`}
                    </div>
                    <div className="text-blue-900 font-bold text-sm">= {customsValueCalc.toLocaleString()}원</div>
                  </div>
                )}

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

                <div className="grid grid-cols-3 gap-2">
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
                  <div>
                    <label className={labelCls}>통관비 (원)</label>
                    <Input type="number" value={form.brokerFee} onChange={e => setForm(f => ({ ...f, brokerFee: e.target.value }))} placeholder="150000" />
                  </div>
                </div>

                {/* 합계 */}
                {totalTax > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-sm font-medium">총 납부액</span>
                    <span className="text-lg font-bold text-red-600">{totalTax.toLocaleString()}원</span>
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
                          const fileList = e.target.files;
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
  const totalFee  = filtered.reduce((s, i) => s + (i.brokerFee || 0), 0);

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
          <Button size="sm" className="h-9 gap-1 ml-auto" onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">통관 등록</span>
          </Button>
        </div>

        {/* 요약 */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '관세 합계', value: totalDuty, color: 'text-orange-600' },
              { label: '부가세 합계', value: totalVat, color: 'text-purple-600' },
              { label: '총 납부액', value: totalDuty + totalVat + totalFee, color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-lg px-4 py-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className={cn('text-lg font-bold', color)}>{value.toLocaleString()}원</div>
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
                  const total = (imp.duty || 0) + (imp.vat || 0) + (imp.brokerFee || 0);
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
