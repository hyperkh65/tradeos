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
import type { Import, ImportItem, ImportDocument, ImportDocType, Shipment, Company } from '@/types';

// ── 한국 행정구역 ──────────────────────────────────────────────────────────────
const KR_REGIONS: Record<string, string[]> = {
  '서울특별시': ['강남구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'],
  '인천광역시': ['계양구','남동구','동구','미추홀구','부평구','서구','연수구','중구','강화군','옹진군'],
  '경기도': ['가평군','고양시','과천시','광명시','광주시','구리시','군포시','김포시','남양주시','동두천시','부천시','성남시','수원시','시흥시','안산시','안성시','안양시','양주시','양평군','여주시','연천군','오산시','용인시','의왕시','의정부시','이천시','파주시','평택시','포천시','하남시','화성시'],
  '부산광역시': ['강서구','금정구','기장군','남구','동구','동래구','부산진구','북구','사상구','사하구','서구','수영구','연제구','영도구','중구','해운대구'],
  '대구광역시': ['남구','달서구','달성군','동구','북구','서구','수성구','중구'],
  '광주광역시': ['광산구','남구','동구','북구','서구'],
  '대전광역시': ['대덕구','동구','서구','유성구','중구'],
  '울산광역시': ['남구','동구','북구','울주군','중구'],
  '세종특별자치시': ['세종시'],
  '강원특별자치도': ['강릉시','고성군','동해시','삼척시','속초시','양구군','양양군','영월군','원주시','인제군','정선군','철원군','춘천시','태백시','평창군','홍천군','화천군','횡성군'],
  '충청북도': ['괴산군','단양군','보은군','영동군','옥천군','음성군','제천시','증평군','진천군','청주시','충주시'],
  '충청남도': ['계룡시','공주시','금산군','논산시','당진시','보령시','부여군','서산시','서천군','아산시','예산군','천안시','청양군','태안군','홍성군'],
  '전북특별자치도': ['고창군','군산시','김제시','남원시','무주군','부안군','순창군','완주군','익산시','임실군','장수군','전주시','정읍시','진안군'],
  '전라남도': ['강진군','고흥군','곡성군','광양시','구례군','나주시','담양군','목포시','무안군','보성군','순천시','신안군','여수시','영광군','영암군','완도군','장성군','장흥군','진도군','함평군','해남군','화순군'],
  '경상북도': ['경산시','경주시','고령군','구미시','김천시','문경시','봉화군','상주시','성주군','안동시','영덕군','영양군','영주시','영천시','예천군','울릉군','울진군','의성군','청도군','청송군','칠곡군','포항시'],
  '경상남도': ['거제시','거창군','고성군','김해시','남해군','밀양시','사천시','산청군','양산시','의령군','진주시','창녕군','창원시','통영시','하동군','함안군','함양군','합천군'],
  '제주특별자치도': ['서귀포시','제주시'],
};
const KR_PROVINCES = Object.keys(KR_REGIONS);

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
  clearance_cert:  '수입면장',
  tax_bill:        '납세고지서',
  co:              'C/O',
  inspection:      '검사결과서',
  freight_invoice: '운임청구서',
  warehouse_bill:  '창고비내역서',
  broker_invoice:  '관세사수수료',
  other:           '기타',
};
const DOC_TYPE_COLOR: Record<ImportDocType, string> = {
  clearance_cert:  'bg-blue-100 text-blue-700',
  tax_bill:        'bg-orange-100 text-orange-700',
  co:              'bg-teal-100 text-teal-700',
  inspection:      'bg-purple-100 text-purple-700',
  freight_invoice: 'bg-cyan-100 text-cyan-700',
  warehouse_bill:  'bg-yellow-100 text-yellow-700',
  broker_invoice:  'bg-indigo-100 text-indigo-700',
  other:           'bg-gray-100 text-gray-600',
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
          {i < STATUS_STEPS.length - 1 && <div className={cn('w-3 h-px', i < idx ? 'bg-blue-500' : 'bg-gray-200')} />}
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

  const [brokers, setBrokers] = useState<Company[]>([]);
  const [brokerMode, setBrokerMode] = useState<'select' | 'manual'>('select');
  const [linkedShipment, setLinkedShipment] = useState<Shipment | null>(null);
  const [shipmentLoading, setShipmentLoading] = useState(false);

  // ── 품목 테이블 state ──────────────────────────────────────────────────────
  const [items, setItems] = useState<(ImportItem & { customsValueStr: string; dutyRateStr: string })[]>(
    (item?.items || []).map(i => ({
      ...i,
      customsValueStr: i.customsValue?.toString() || '',
      dutyRateStr: i.dutyRate?.toString() || '',
    }))
  );

  // ── 지역 선택 state ────────────────────────────────────────────────────────
  const initRegion = item?.inlandFreightRegion || '';
  const initProvince = KR_PROVINCES.find(p => initRegion.startsWith(p)) || '';
  const initCity = initProvince ? initRegion.replace(initProvince, '').trim() : '';
  const [selectedProvince, setSelectedProvince] = useState(initProvince);
  const [selectedCity, setSelectedCity] = useState(initCity);

  // ── 기타비용 3개 ──────────────────────────────────────────────────────────
  const initCustomCosts = item?.customCosts || [];
  const [customCosts, setCustomCosts] = useState([
    { name: initCustomCosts[0]?.name || '', amount: initCustomCosts[0]?.amount?.toString() || '' },
    { name: initCustomCosts[1]?.name || '', amount: initCustomCosts[1]?.amount?.toString() || '' },
    { name: initCustomCosts[2]?.name || '', amount: initCustomCosts[2]?.amount?.toString() || '' },
  ]);

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
    detentionFee: item?.detentionFee?.toString() || '',
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
          if (item?.brokerName && !d.data.find((b: Company) => b.name === item.brokerName)) setBrokerMode('manual');
        } else setBrokerMode('manual');
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
      // 운임 자동입력
      if (found?.freightCost && found.freightCurrency === 'USD' && !form.freightUsd) {
        setForm(f => ({ ...f, freightUsd: String(found.freightCost) }));
      }
      // 품목 자동입력 (items 비어있을 때만)
      if (found?.cargoItems?.length && items.length === 0) {
        setItems(found.cargoItems.map((c, idx) => ({
          id: `item-${idx}`,
          productName: c.productName,
          hsCode: '',
          dutyRate: undefined,
          customsValue: undefined,
          duty: undefined,
          vat: undefined,
          qty: c.qty,
          customsValueStr: '',
          dutyRateStr: '',
        })));
      }
    } finally { setShipmentLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.freightUsd, items.length]);

  useEffect(() => {
    if (form.shipmentBusinessId) fetchLinkedShipment(form.shipmentBusinessId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.shipmentBusinessId]);

  // 운임 자동환산
  const freightExRate = parseFloat(form.freightExchangeRate || form.exchangeRate || '0');
  const freightKrwCalc = form.freightUsd ? Math.round(parseFloat(form.freightUsd) * freightExRate) : 0;
  const effectiveFreightKrw = form.freightKrw ? parseFloat(form.freightKrw) : (freightKrwCalc || 0);

  // 과세가격 자동계산
  const invoiceKrw = parseFloat(form.invoiceValue || '0') * parseFloat(form.exchangeRate || '0');
  const customsValueCalc = Math.round(invoiceKrw + effectiveFreightKrw + parseFloat(form.insuranceKrw || '0'));

  // 품목별 계산
  const itemsWithCalc = items.map(it => {
    const cv = parseFloat(it.customsValueStr || '0');
    const dr = parseFloat(it.dutyRateStr || '0');
    const d = Math.round(cv * dr / 100);
    const v = Math.round((cv + d) * 0.1);
    return { ...it, customsValue: cv || undefined, dutyRate: dr || undefined, duty: d || undefined, vat: v || undefined };
  });
  const itemsHaveData = itemsWithCalc.some(i => (i.customsValue || 0) > 0 && (i.dutyRate || 0) > 0);
  const totalItemDuty = itemsWithCalc.reduce((s, i) => s + (i.duty || 0), 0);
  const totalItemVat = itemsWithCalc.reduce((s, i) => s + (i.vat || 0), 0);
  const totalItemCv = itemsWithCalc.reduce((s, i) => s + (i.customsValue || 0), 0);

  // 단일 세율 계산 (품목 데이터 없을 때)
  const dutyCalc = itemsHaveData ? totalItemDuty : Math.round(customsValueCalc * (parseFloat(form.dutyRate || '0') / 100));
  const vatCalc  = itemsHaveData ? totalItemVat  : Math.round((customsValueCalc + dutyCalc) * 0.1);

  // 기타비용
  const inspectionFeeVal = parseFloat(form.inspectionFee || '0');
  const brokerFeeVal     = parseFloat(form.brokerFee || '0');
  const warehouseFeeVal  = parseFloat(form.warehouseFee || '0');
  const detentionFeeVal  = parseFloat(form.detentionFee || '0');
  const inlandFreightVal = parseFloat(form.inlandFreight || '0');
  const customCostsTotal = customCosts.reduce((s, c) => s + (parseFloat(c.amount || '0') || 0), 0);
  const otherCosts = inspectionFeeVal + brokerFeeVal + warehouseFeeVal + detentionFeeVal + inlandFreightVal + customCostsTotal;

  const dutyFinal = parseFloat(form.duty || '0') || dutyCalc;
  const vatFinal  = parseFloat(form.vat || '0') || vatCalc;
  const totalTax  = dutyFinal + vatFinal + otherCosts;

  const inlandFreightRegion = selectedProvince
    ? selectedCity ? `${selectedProvince} ${selectedCity}` : selectedProvince
    : '';

  const fetchRate = async () => {
    setRateLoading(true); setRateMsg(null);
    try {
      const res = await fetch(`/api/imports/exchange-rate?currency=${form.invoiceCurrency}`);
      const d = await res.json();
      if (d.rate) {
        setForm(f => ({ ...f, exchangeRate: String(d.rate) }));
        setRateMsg({ text: `${d.source} (${d.weekCode}주): 1${form.invoiceCurrency} = ${d.rate.toLocaleString()}원`, ok: true });
      } else setRateMsg({ text: d.error || '환율 조회 실패', ok: false });
    } catch { setRateMsg({ text: '환율 조회 실패. 직접 입력하세요.', ok: false }); }
    finally { setRateLoading(false); }
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
    } catch (e) { console.error('[upload docs]', e); }
    finally { setDocUploading(false); }
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
        customsValue: itemsHaveData ? totalItemCv : (customsValueCalc || undefined),
        dutyRate: form.dutyRate ? Number(form.dutyRate) : undefined,
        duty: form.duty ? Number(form.duty) : (dutyCalc || undefined),
        vat: form.vat ? Number(form.vat) : (vatCalc || undefined),
        brokerFee: form.brokerFee ? Number(form.brokerFee) : undefined,
        inspectionFee: form.inspectionFee ? Number(form.inspectionFee) : undefined,
        warehouseFee: form.warehouseFee ? Number(form.warehouseFee) : undefined,
        detentionFee: form.detentionFee ? Number(form.detentionFee) : undefined,
        inlandFreight: form.inlandFreight ? Number(form.inlandFreight) : undefined,
        inlandFreightRegion: inlandFreightRegion || undefined,
        refundAmount: form.refundAmount ? Number(form.refundAmount) : undefined,
        refundStatus: form.refundStatus,
        items: itemsWithCalc.map(({ customsValueStr: _cv, dutyRateStr: _dr, ...rest }) => rest),
        customCosts: customCosts.filter(c => c.name && parseFloat(c.amount || '0') > 0).map(c => ({ name: c.name, amount: parseFloat(c.amount) })),
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
        if (pendingFiles.length > 0) { await uploadDocs(savedId, pendingFiles); setPendingFiles([]); }
      }
      onSave();
    } finally { setSaving(false); }
  };

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
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">{item ? '통관 수정' : '통관 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="flex border-b shrink-0">
          {TABS.map(t => (
            <button key={t.key} type="button"
              className={cn('px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
              onClick={() => setTab(t.key)}>{t.label}</button>
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
                    <input list="shipment-list" className={inputCls} placeholder="SHP-2026-0001"
                      value={form.shipmentBusinessId} required
                      onChange={e => {
                        const v = e.target.value;
                        const s = shipments.find(s => s.businessId === v);
                        setForm(f => ({ ...f, shipmentBusinessId: v, shipmentId: s?.id || f.shipmentId }));
                      }} />
                    <datalist id="shipment-list">
                      {shipments.map(s => <option key={s.id} value={s.businessId}>{s.businessId}{s.pol && s.pod ? ` (${s.pol}→${s.pod})` : ''}</option>)}
                    </datalist>
                  </div>
                  <div>
                    <label className={labelCls}>상태</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Import['status'] }))} className={inputCls}>
                      {STATUS_STEPS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* 선적 참고 패널 */}
                {shipmentLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> 선적 정보 로딩 중...</div>}
                {linkedShipment && !shipmentLoading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 text-xs">
                    <div className="font-medium text-blue-800 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />선적 참고 ({linkedShipment.businessId})</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-blue-700">
                      {linkedShipment.blNo && <div><span className="text-blue-500">B/L:</span> {linkedShipment.blNo}</div>}
                      {linkedShipment.freightCost && (
                        <div><span className="text-blue-500">운임:</span> {linkedShipment.freightCurrency || 'USD'} {linkedShipment.freightCost.toLocaleString()}
                          {linkedShipment.freightCurrency === 'USD' && <button type="button" className="ml-1.5 text-blue-600 underline hover:text-blue-800" onClick={() => setForm(f => ({ ...f, freightUsd: String(linkedShipment.freightCost) }))}>세금탭 적용</button>}
                        </div>
                      )}
                      {linkedShipment.pol && linkedShipment.pod && <div><span className="text-blue-500">구간:</span> {linkedShipment.pol}→{linkedShipment.pod}</div>}
                      {linkedShipment.eta && <div><span className="text-blue-500">ETA:</span> {linkedShipment.eta}</div>}
                    </div>
                    {hasCoDoc && <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded px-2 py-1.5 text-teal-700"><CheckCircle2 className="w-3.5 h-3.5 shrink-0" />선적에 C/O 서류 있음. 번호 확인 후 입력하세요.</div>}
                    {hasInvoiceDoc && <div className="flex items-center gap-1.5 text-blue-600"><FileText className="w-3.5 h-3.5 shrink-0" />선적 인보이스 있음 — <a href={linkedShipment.documents.find(d => d.docType === 'invoice')?.url} target="_blank" rel="noopener noreferrer" className="underline">보기</a></div>}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={cn(labelCls, 'mb-0')}>관세사</label>
                      {brokers.length > 0 && <button type="button" className="text-xs text-blue-500 hover:text-blue-700" onClick={() => setBrokerMode(m => m === 'select' ? 'manual' : 'select')}>{brokerMode === 'select' ? '직접 입력' : '목록에서 선택'}</button>}
                    </div>
                    {brokerMode === 'select' && brokers.length > 0
                      ? <select value={form.brokerName} onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))} className={inputCls}><option value="">-- 선택 --</option>{brokers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}</select>
                      : <Input value={form.brokerName} onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))} placeholder="관세법인 대한" />}
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
                    {[{ label: '입항일', key: 'arrivalDate' }, { label: '신고일', key: 'declarationDate' }, { label: '납세일', key: 'taxPaymentDate' }, { label: '반출일', key: 'releaseDate' }].map(({ label, key }) => (
                      <div key={key}><label className={labelCls}>{label}</label><Input type="date" value={(form as Record<string, unknown>)[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>세관검사 유형</label>
                    <select value={form.inspectionType} onChange={e => setForm(f => ({ ...f, inspectionType: e.target.value as 'none' | 'document' | 'physical' }))} className={inputCls}>
                      <option value="none">없음</option><option value="document">서류검사</option><option value="physical">현품검사</option>
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
                    <label className={labelCls}>C/O 번호{hasCoDoc && <span className="ml-2 text-teal-600 font-normal">선적에 C/O 서류 있음</span>}</label>
                    <Input value={form.coNo} onChange={e => setForm(f => ({ ...f, coNo: e.target.value }))} placeholder="C/O 번호 (파싱 불가 시 수동 입력)" />
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
                        <option value="">선택</option>{FTA_TYPES.map(t => <option key={t}>{t}</option>)}
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

                {/* ① 인보이스 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">① 인보이스 (과세가격 기준)</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className={labelCls}>인보이스 금액{hasInvoiceDoc && <span className="ml-2 text-blue-500 font-normal">선적 인보이스 참조</span>}</label>
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
                      <button type="button" onClick={fetchRate} disabled={rateLoading} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50">
                        {rateLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}관세청 환율 불러오기
                      </button>
                    </div>
                    <Input type="number" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} placeholder="1350" />
                    {rateMsg && <div className={cn('flex items-center gap-1.5 mt-1.5 text-xs', rateMsg.ok ? 'text-green-700' : 'text-red-600')}>{rateMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}{rateMsg.text}</div>}
                  </div>
                </div>

                {/* ② 운임 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">② 운임 (과세가격 포함)</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>운임 (USD){linkedShipment?.freightCost && linkedShipment.freightCurrency === 'USD' && <span className="ml-1 text-blue-500 font-normal">선적: ${linkedShipment.freightCost.toLocaleString()}</span>}</label>
                      <Input type="number" value={form.freightUsd} onChange={e => setForm(f => ({ ...f, freightUsd: e.target.value, freightKrw: '' }))} placeholder="700" />
                    </div>
                    <div>
                      <label className={labelCls}>운임환율<span className="ml-1 text-[10px] text-muted-foreground font-normal">비워두면 과세환율 사용</span></label>
                      <Input type="number" value={form.freightExchangeRate} onChange={e => setForm(f => ({ ...f, freightExchangeRate: e.target.value, freightKrw: '' }))} placeholder={form.exchangeRate || '1350'} />
                    </div>
                  </div>
                  {freightKrwCalc > 0 && !form.freightKrw && <div className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1.5">운임 자동환산: ${form.freightUsd} × {freightExRate.toLocaleString()}원 = <strong>{freightKrwCalc.toLocaleString()}원</strong></div>}
                  <div>
                    <label className={labelCls}>운임 KRW (직접 입력 시 우선 적용)</label>
                    <Input type="number" value={form.freightKrw} onChange={e => setForm(f => ({ ...f, freightKrw: e.target.value }))} placeholder={freightKrwCalc ? String(freightKrwCalc) : '850000'} />
                  </div>
                </div>

                {/* ③ 보험료 */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">③ 보험료 (과세가격 포함)</div>
                  <Input type="number" value={form.insuranceKrw} onChange={e => setForm(f => ({ ...f, insuranceKrw: e.target.value }))} placeholder="50000 (원)" />
                </div>

                {/* 과세가격 요약 */}
                {customsValueCalc > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
                    <div className="font-medium text-blue-800">과세가격 (CIF) 자동계산</div>
                    <div className="text-blue-700 space-y-0.5">
                      <div>인보이스: {parseFloat(form.invoiceValue||'0').toLocaleString()} {form.invoiceCurrency} × {parseFloat(form.exchangeRate||'0').toLocaleString()}원 = {Math.round(invoiceKrw).toLocaleString()}원</div>
                      {effectiveFreightKrw > 0 && <div>운임: {effectiveFreightKrw.toLocaleString()}원</div>}
                      {parseFloat(form.insuranceKrw||'0') > 0 && <div>보험료: {parseFloat(form.insuranceKrw).toLocaleString()}원</div>}
                    </div>
                    <div className="text-blue-900 font-bold text-sm border-t border-blue-200 pt-1">과세가격 합계 = {customsValueCalc.toLocaleString()}원</div>
                  </div>
                )}

                {/* ④ 품목별 세율 테이블 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">④ 품목별 관세 (선적 화물 기준)</div>
                    <button type="button" className="text-xs text-blue-500 hover:text-blue-700"
                      onClick={() => setItems(prev => [...prev, { id: `new-${Date.now()}`, productName: '', hsCode: '', dutyRate: undefined, customsValue: undefined, duty: undefined, vat: undefined, qty: undefined, customsValueStr: '', dutyRateStr: '' }])}>
                      + 품목 추가
                    </button>
                  </div>

                  {items.length > 0 && (
                    <div className="rounded-lg border border-border overflow-hidden text-xs">
                      <div className="grid bg-muted/50 text-muted-foreground font-medium" style={{ gridTemplateColumns: '2fr 1.2fr 0.8fr 1.2fr 1fr 1fr auto' }}>
                        {['품목명', 'HS코드', '관세율%', '과세가격(원)', '관세(자동)', '부가세(자동)', ''].map(h => <div key={h} className="px-2 py-2">{h}</div>)}
                      </div>
                      {items.map((it, idx) => {
                        const cv = parseFloat(it.customsValueStr || '0');
                        const dr = parseFloat(it.dutyRateStr || '0');
                        const d = cv > 0 && dr > 0 ? Math.round(cv * dr / 100) : 0;
                        const v = cv > 0 ? Math.round((cv + d) * 0.1) : 0;
                        return (
                          <div key={it.id} className="grid border-t border-border" style={{ gridTemplateColumns: '2fr 1.2fr 0.8fr 1.2fr 1fr 1fr auto' }}>
                            <div className="px-2 py-1.5"><input className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={it.productName} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, productName: e.target.value } : p))} placeholder="품목명" /></div>
                            <div className="px-2 py-1.5"><input className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={it.hsCode || ''} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, hsCode: e.target.value } : p))} placeholder="선택사항" /></div>
                            <div className="px-2 py-1.5"><input type="number" className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={it.dutyRateStr} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, dutyRateStr: e.target.value } : p))} placeholder="8" /></div>
                            <div className="px-2 py-1.5"><input type="number" className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={it.customsValueStr} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, customsValueStr: e.target.value } : p))} placeholder="0" /></div>
                            <div className="px-2 py-1.5 text-orange-700 font-medium flex items-center">{d > 0 ? d.toLocaleString() : '-'}</div>
                            <div className="px-2 py-1.5 text-purple-700 font-medium flex items-center">{v > 0 ? v.toLocaleString() : '-'}</div>
                            <div className="px-2 py-1.5 flex items-center"><button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}><X className="w-3.5 h-3.5 text-red-400 hover:text-red-600" /></button></div>
                          </div>
                        );
                      })}
                      {items.length > 1 && (
                        <div className="grid border-t-2 border-border bg-muted/30 font-semibold" style={{ gridTemplateColumns: '2fr 1.2fr 0.8fr 1.2fr 1fr 1fr auto' }}>
                          <div className="px-2 py-2 col-span-3 text-muted-foreground">합계</div>
                          <div className="px-2 py-2 text-blue-700">{totalItemCv > 0 ? totalItemCv.toLocaleString() : '-'}</div>
                          <div className="px-2 py-2 text-orange-700">{totalItemDuty > 0 ? totalItemDuty.toLocaleString() : '-'}</div>
                          <div className="px-2 py-2 text-purple-700">{totalItemVat > 0 ? totalItemVat.toLocaleString() : '-'}</div>
                          <div />
                        </div>
                      )}
                    </div>
                  )}

                  {/* 단일 세율 (품목 없을 때) */}
                  {!itemsHaveData && (
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={labelCls}>HS Code (대표)</label><Input value={form.hsCode} onChange={e => setForm(f => ({ ...f, hsCode: e.target.value }))} placeholder="9405.10-0000" /></div>
                      <div><label className={labelCls}>관세율 % (일괄)</label><Input type="number" step="0.1" value={form.dutyRate} onChange={e => setForm(f => ({ ...f, dutyRate: e.target.value }))} placeholder="8" /></div>
                    </div>
                  )}
                </div>

                {/* 관세/부가세 확정 입력 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>관세 (원){!form.duty && dutyCalc > 0 && <span className="text-blue-500 ml-1">≈{dutyCalc.toLocaleString()}</span>}</label>
                    <Input type="number" value={form.duty} onChange={e => setForm(f => ({ ...f, duty: e.target.value }))} placeholder={dutyCalc ? String(dutyCalc) : '0'} />
                  </div>
                  <div>
                    <label className={labelCls}>부가세 (원){!form.vat && vatCalc > 0 && <span className="text-blue-500 ml-1">≈{vatCalc.toLocaleString()}</span>}</label>
                    <Input type="number" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} placeholder={vatCalc ? String(vatCalc) : '0'} />
                  </div>
                </div>

                {/* 기타비용 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">기타비용 <span className="font-normal normal-case text-muted-foreground">(부가세 비해당)</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>세관검사비 (원){form.inspectionType === 'none' && <span className="ml-1 text-muted-foreground font-normal">(검사 없음)</span>}</label>
                      <Input type="number" value={form.inspectionFee} onChange={e => setForm(f => ({ ...f, inspectionFee: e.target.value }))} placeholder="검사 발생 시 입력" disabled={form.inspectionType === 'none'} />
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
                      <label className={labelCls}>억류비 / Detention (원)</label>
                      <Input type="number" value={form.detentionFee} onChange={e => setForm(f => ({ ...f, detentionFee: e.target.value }))} placeholder="0" />
                    </div>
                  </div>

                  {/* 내륙운송비 + 지역 */}
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">내륙운송비</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={labelCls}>시/도</label>
                        <select value={selectedProvince} onChange={e => { setSelectedProvince(e.target.value); setSelectedCity(''); }} className={inputCls}>
                          <option value="">-- 선택 --</option>
                          {KR_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>시/군/구</label>
                        <select value={selectedCity} onChange={e => setSelectedCity(e.target.value)} className={inputCls} disabled={!selectedProvince}>
                          <option value="">-- 선택 --</option>
                          {selectedProvince && KR_REGIONS[selectedProvince]?.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>운송비 (원)</label>
                        <Input type="number" value={form.inlandFreight} onChange={e => setForm(f => ({ ...f, inlandFreight: e.target.value }))} placeholder="300000" />
                      </div>
                    </div>
                    {inlandFreightRegion && <div className="text-xs text-muted-foreground">도착지: <strong>{inlandFreightRegion}</strong></div>}
                  </div>

                  {/* 기타비용 3개 자유입력 */}
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground font-medium">기타 추가비용</div>
                    {customCosts.map((c, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-2 items-end">
                        <div className="col-span-2"><label className={cn(labelCls, idx > 0 ? 'sr-only' : '')}>비용 항목명</label><Input value={c.name} onChange={e => setCustomCosts(prev => prev.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))} placeholder={`기타비용 ${idx + 1}`} /></div>
                        <div><label className={cn(labelCls, idx > 0 ? 'sr-only' : '')}>금액 (원)</label><Input type="number" value={c.amount} onChange={e => setCustomCosts(prev => prev.map((p, i) => i === idx ? { ...p, amount: e.target.value } : p))} placeholder="0" /></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 총납부 요약 */}
                {(customsValueCalc > 0 || totalTax > 0) && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">관세</span><span>{dutyFinal.toLocaleString()}원</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">부가세</span><span>{vatFinal.toLocaleString()}원</span></div>
                    {inspectionFeeVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">세관검사비</span><span>{inspectionFeeVal.toLocaleString()}원</span></div>}
                    {brokerFeeVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">통관비(관세사)</span><span>{brokerFeeVal.toLocaleString()}원</span></div>}
                    {warehouseFeeVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">창고비</span><span>{warehouseFeeVal.toLocaleString()}원</span></div>}
                    {detentionFeeVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">억류비(Detention)</span><span>{detentionFeeVal.toLocaleString()}원</span></div>}
                    {inlandFreightVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">내륙운송비{inlandFreightRegion ? ` (${inlandFreightRegion})` : ''}</span><span>{inlandFreightVal.toLocaleString()}원</span></div>}
                    {customCosts.filter(c => c.name && parseFloat(c.amount||'0') > 0).map((c, i) => <div key={i} className="flex justify-between"><span className="text-muted-foreground">{c.name}</span><span>{parseFloat(c.amount).toLocaleString()}원</span></div>)}
                    <div className="flex justify-between items-center border-t border-border pt-1.5 mt-1"><span className="font-semibold">총 납부액</span><span className="text-lg font-bold text-red-600">{totalTax.toLocaleString()}원</span></div>
                    {parseFloat(form.refundAmount||'0') > 0 && <div className="flex justify-between text-green-700"><span>환급 후 실납부</span><span className="font-bold">{(totalTax - parseFloat(form.refundAmount||'0')).toLocaleString()}원</span></div>}
                  </div>
                )}

                {/* 환급 */}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>환급액 (원)</label><Input type="number" value={form.refundAmount} onChange={e => setForm(f => ({ ...f, refundAmount: e.target.value }))} placeholder="FTA 사후 환급 등" /></div>
                  <div>
                    <label className={labelCls}>환급 상태</label>
                    <select value={form.refundStatus} onChange={e => setForm(f => ({ ...f, refundStatus: e.target.value as '없음' | '신청' | '완료' }))} className={inputCls}>
                      <option value="없음">없음</option><option value="신청">신청</option><option value="완료">완료</option>
                    </select>
                  </div>
                </div>

                {form.ftaApplicable && dutyCalc > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                    FTA 미적용 시 관세 ≈ {Math.round(customsValueCalc * 0.08).toLocaleString()}원 → <span className="font-bold">절감 ≈ {Math.max(0, Math.round(customsValueCalc * 0.08) - dutyCalc).toLocaleString()}원</span>
                  </div>
                )}
              </div>
            )}

            {/* ── 서류 탭 ── */}
            {tab === 'docs' && (
              <div className="space-y-4">
                {/* 선적 서류 자동 표시 */}
                {linkedShipment?.documents?.length ? (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />선적 서류 (참조 — 읽기 전용)</div>
                    <div className="space-y-1">
                      {linkedShipment.documents.map(doc => (
                        <div key={doc.id} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs">
                          <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="flex-1 truncate text-blue-800">{doc.originalName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 shrink-0">
                            {doc.docType === 'invoice' ? '인보이스' : doc.docType === 'packing_list' ? '패킹리스트' : doc.docType === 'bl' ? 'B/L' : doc.docType === 'co' ? 'C/O' : '기타'}
                          </span>
                          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 shrink-0"><Download className="w-3.5 h-3.5" /></a>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* 통관 서류 업로드 */}
                <div>
                  {linkedShipment?.documents?.length ? <div className="text-xs font-semibold text-muted-foreground mb-2">통관 서류 업로드</div> : null}
                  <div className="flex items-center gap-2">
                    <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value as ImportDocType)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                      {(Object.entries(DOC_TYPE_LABEL) as [ImportDocType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed rounded-lg cursor-pointer hover:bg-muted text-muted-foreground hover:text-foreground">
                      <input ref={docFileRef} type="file" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
                        onChange={e => {
                          if (!e.target.files?.length) return;
                          const files = Array.from(e.target.files);
                          const id = savedIdRef.current;
                          if (id) { uploadDocs(id, files.map(f => ({ file: f, docType: uploadDocType }))).then(() => {}); }
                          else { setPendingFiles(prev => [...prev, ...files.map(f => ({ file: f, docType: uploadDocType }))]); }
                          e.target.value = '';
                        }} />
                      {docUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}파일 업로드
                    </label>
                  </div>
                </div>

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

                {documents.length > 0 ? (
                  <div className="space-y-1.5">
                    {documents.map(doc => (
                      <div key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg border border-border">
                        {doc.originalName.match(/\.(pdf)$/i) ? <FileText className="w-4 h-4 text-red-500 shrink-0" /> : doc.originalName.match(/\.(jpe?g|png)$/i) ? <File className="w-4 h-4 text-yellow-500 shrink-0" /> : <File className="w-4 h-4 text-green-600 shrink-0" />}
                        <span className="flex-1 text-xs truncate" title={doc.originalName}>{doc.originalName}</span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0', DOC_TYPE_COLOR[doc.docType])}>{DOC_TYPE_LABEL[doc.docType]}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{doc.size ? `${(doc.size/1024).toFixed(0)}KB` : ''}</span>
                        {(doc.docType === 'clearance_cert' || doc.docType === 'tax_bill') && doc.originalName.match(/\.pdf$/i) && savedIdRef.current && (
                          <button type="button" title="PDF 자동 파싱" className="text-purple-500 hover:text-purple-700 shrink-0"
                            onClick={async () => {
                              const id = savedIdRef.current; if (!id) return;
                              const res = await fetch(`/api/imports/${id}/parse-doc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: doc.filename, docType: doc.docType }) });
                              const d = await res.json();
                              if (d.data && Object.keys(d.data).length > 0) {
                                const e = d.data;
                                setForm(f => ({ ...f, ...(e.declarationNo && !f.declarationNo ? { declarationNo: e.declarationNo } : {}), ...(e.duty && !f.duty ? { duty: String(e.duty) } : {}), ...(e.vat && !f.vat ? { vat: String(e.vat) } : {}), ...(e.taxPaymentDate && !f.taxPaymentDate ? { taxPaymentDate: e.taxPaymentDate } : {}) }));
                                alert(`파싱 완료: ${Object.keys(e).join(', ')}`);
                              } else alert('파싱 결과 없음. 수동 입력하세요.');
                            }}>
                            <Wand2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 shrink-0"><Download className="w-3.5 h-3.5" /></a>
                        <button type="button" onClick={() => deleteDoc(doc.id)} className="text-red-400 hover:text-red-600 shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground">서류를 업로드하세요 (수입면장, 납세고지서, C/O 등)</div>
                )}
              </div>
            )}
          </div>

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
    const matchSearch = !search || i.businessId.includes(search) || i.shipmentBusinessId.includes(search) || (i.declarationNo ?? '').includes(search) || (i.brokerName ?? '').includes(search);
    return matchStatus && matchSearch;
  });

  const totalDuty  = filtered.reduce((s, i) => s + (i.duty || 0), 0);
  const totalVat   = filtered.reduce((s, i) => s + (i.vat  || 0), 0);
  const totalOther = filtered.reduce((s, i) => s + (i.brokerFee || 0) + (i.inspectionFee || 0) + (i.warehouseFee || 0) + (i.detentionFee || 0) + (i.inlandFreight || 0) + (i.customCosts?.reduce((a, c) => a + c.amount, 0) || 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="수입통관" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="통관번호, 선적, 관세사 검색" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
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

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground"><TruckIcon className="w-10 h-10 mx-auto mb-2 opacity-20" />통관 내역이 없습니다.</div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['통관번호','선적','관세사','신고번호','관세','부가세','총납부','단계',''].map(h => (
                    <th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', h && h !== '' && ['관세','부가세','총납부'].includes(h) ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(imp => {
                  const total = (imp.duty||0) + (imp.vat||0) + (imp.brokerFee||0) + (imp.inspectionFee||0) + (imp.warehouseFee||0) + (imp.detentionFee||0) + (imp.inlandFreight||0) + (imp.customCosts?.reduce((a,c)=>a+c.amount,0)||0);
                  return (
                    <tr key={imp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{imp.businessId}</td>
                      <td className="px-4 py-3 text-xs font-medium">{imp.shipmentBusinessId}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{imp.brokerName || '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{imp.declarationNo || '-'}</td>
                      <td className="px-4 py-3 text-right text-xs">{imp.duty ? imp.duty.toLocaleString()+'원' : '-'}</td>
                      <td className="px-4 py-3 text-right text-xs">{imp.vat ? imp.vat.toLocaleString()+'원' : '-'}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-red-600">{total > 0 ? total.toLocaleString()+'원' : '-'}</td>
                      <td className="px-4 py-3"><StatusSteps status={imp.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {(imp.documents?.length ?? 0) > 0 && <span className="text-xs text-muted-foreground mr-1">📎{imp.documents!.length}</span>}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: imp })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(imp.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
        <ImportModal item={modal.item} shipments={shipments}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
