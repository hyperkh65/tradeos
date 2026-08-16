'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  TruckIcon, Plus, Search, X, Loader2, Pencil, Trash2,
  FileText, File, Upload, Download, RefreshCw, CheckCircle2,
  AlertCircle, Info, Wand2, Lock, History, ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Import, ImportItem, ImportDocument, ImportDocType,
  Shipment, Company, SettlementItem, SettlementHistoryEntry,
} from '@/types';

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
  warehouse_bill:  'Terminal Storage 내역',
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

function StatusSteps({ status }: { status: Import['status'] }) {
  const idx = STATUS_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center gap-0.5">
      {STATUS_STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className={cn('w-2 h-2 rounded-full', i <= idx ? 'bg-blue-500' : 'bg-gray-200')} />
          {i < STATUS_STEPS.length - 1 && <div className={cn('w-3 h-0.5', i < idx ? 'bg-blue-400' : 'bg-gray-200')} />}
        </div>
      ))}
      <span className={cn('ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_COLOR[status])}>
        {STATUS_STEPS[idx]?.label ?? status}
      </span>
    </div>
  );
}

// ── 모달 ──────────────────────────────────────────────────────────────────────
function ImportModal({
  item, shipments, currentUser, onClose, onSave,
}: {
  item?: Import | null;
  shipments: Pick<Shipment, 'id' | 'businessId' | 'forwarderName' | 'pol' | 'pod' | 'etd'>[];
  currentUser?: { id: string; name: string; role: string } | null;
  onClose: () => void;
  onSave: () => void;
}) {
  type Tab = 'basic' | 'tax' | 'settlement' | 'docs';
  const [tab, setTab] = useState<Tab>('basic');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateMsg, setRateMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [documents, setDocuments] = useState<ImportDocument[]>(item?.documents || []);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; docType: ImportDocType }[]>([]);
  const [uploadDocType, setUploadDocType] = useState<ImportDocType>('clearance_cert');
  const [parseLoading, setParseLoading] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const [sheetModal, setSheetModal] = useState<{ shipmentId: string; filename: string; docName: string; sheets: string[] } | null>(null);
  const [sheetLoading, setSheetLoading] = useState<string | null>(null); // filename being loaded
  const docFileRef = useRef<HTMLInputElement>(null);
  const parseFileRef = useRef<HTMLInputElement>(null);
  const pendingExcelFileRef = useRef<File | null>(null); // 시트 선택 대기 중인 업로드 파일
  const savedIdRef = useRef<string | null>(item?.id || null);

  const [brokers, setBrokers] = useState<Company[]>([]);
  const [brokerMode, setBrokerMode] = useState<'select' | 'manual'>('select');
  const [carriers, setCarriers] = useState<Company[]>([]);
  const [carrierMode, setCarrierMode] = useState<'select' | 'manual'>('select');
  const [linkedShipment, setLinkedShipment] = useState<Shipment | null>(null);
  const [linkedPO, setLinkedPO] = useState<{ id: string; businessId: string; piFileUrl?: string; imagesJson?: string } | null>(null);
  const [shipmentLoading, setShipmentLoading] = useState(false);

  // 품목 테이블 state
  const [items, setItems] = useState<(ImportItem & { customsValueStr: string; dutyRateStr: string })[]>(
    (item?.items || []).map(i => ({
      ...i,
      customsValueStr: i.customsValue?.toString() || '',
      dutyRateStr: i.dutyRate?.toString() || '',
    }))
  );

  // 지역 선택 state
  const initRegion = item?.inlandFreightRegion || '';
  const initProvince = KR_PROVINCES.find(p => initRegion.startsWith(p)) || '';
  const initCity = initProvince ? initRegion.replace(initProvince, '').trim() : '';
  const [selectedProvince, setSelectedProvince] = useState(initProvince);
  const [selectedCity, setSelectedCity] = useState(initCity);

  // 기타비용 3개
  const initCustomCosts = item?.customCosts || [];
  const [customCosts, setCustomCosts] = useState([
    { name: initCustomCosts[0]?.name || '', amount: initCustomCosts[0]?.amount?.toString() || '' },
    { name: initCustomCosts[1]?.name || '', amount: initCustomCosts[1]?.amount?.toString() || '' },
    { name: initCustomCosts[2]?.name || '', amount: initCustomCosts[2]?.amount?.toString() || '' },
  ]);

  // 정산서 state
  const [settlementItems, setSettlementItems] = useState<SettlementItem[]>(item?.settlementItems || []);
  const [settlementHistory] = useState<SettlementHistoryEntry[]>(item?.settlementHistory || []);
  const [showHistory, setShowHistory] = useState(false);

  const isClosed = item?.settlementStatus === 'closed';
  const isAdmin = currentUser?.role === 'admin';
  const canEdit = !isClosed || isAdmin;

  const [form, setForm] = useState({
    shipmentBusinessId: item?.shipmentBusinessId || '',
    shipmentId: item?.shipmentId || '',
    brokerName: item?.brokerName || '',
    declarationNo: item?.declarationNo || '',
    blNo: item?.blNo || '',
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
    inspectionRefund: item?.inspectionRefund !== undefined ? item.inspectionRefund.toString() : '',
    warehouseFee: item?.warehouseFee?.toString() || '',
    detentionFee: item?.detentionFee?.toString() || '',
    demurrage: item?.demurrage?.toString() || '',
    inlandFreight: item?.inlandFreight?.toString() || '',
    inlandCarrierId: item?.inlandCarrierId || '',
    inlandCarrierName: item?.inlandCarrierName || '',
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
    inspectionType: (item?.inspectionType || 'none') as 'none' | 'document' | 'physical',
    remark: item?.remark || '',
    status: (item?.status || 'in_progress') as Import['status'],
  });

  // 관세사 + 운송업체 로드
  // sheetModal이 열리면 무조건 세금계산 탭으로 이동
  useEffect(() => { if (sheetModal) setTab('tax'); }, [sheetModal]);

  useEffect(() => {
    fetch('/api/companies?type=관세사').then(r => r.json()).then(d => {
      if (d.data?.length) {
        setBrokers(d.data);
        if (item?.brokerName && !d.data.find((b: Company) => b.name === item.brokerName)) setBrokerMode('manual');
      } else setBrokerMode('manual');
    }).catch(() => setBrokerMode('manual'));

    // 포워더 + 기타 (운송업체)
    Promise.all([
      fetch('/api/companies?type=포워더').then(r => r.json()),
      fetch('/api/companies?type=기타').then(r => r.json()),
    ]).then(([f, g]) => {
      const all = [...(f.data || []), ...(g.data || [])];
      setCarriers(all);
      if (item?.inlandCarrierName && !all.find((c: Company) => c.name === item.inlandCarrierName)) setCarrierMode('manual');
    }).catch(() => setCarrierMode('manual'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLinkedShipment = useCallback(async (bizId: string) => {
    if (!bizId) { setLinkedShipment(null); return; }
    setShipmentLoading(true);
    try {
      // bizId 단일 조회 — Notion 호출 없이 SQLite 로컬 조회만
      const res = await fetch(`/api/shipments?bizId=${encodeURIComponent(bizId)}`);
      const d = await res.json();
      const found: Shipment | undefined = (d.data as Shipment[])?.[0];
      setLinkedShipment(found || null);
      if (found) {
        if (found.blNo && !form.blNo) setForm(f => ({ ...f, blNo: found.blNo || '' }));
        if (found.freightCost && found.freightCurrency === 'USD' && !form.freightUsd) {
          setForm(f => ({ ...f, freightUsd: String(found.freightCost) }));
        }
        if (found.cargoItems?.length && items.length === 0) {
          setItems(found.cargoItems.map((c, idx) => ({
            id: `item-${idx}`, productName: c.productName,
            hsCode: '', dutyRate: undefined, customsValue: undefined,
            duty: undefined, vat: undefined, qty: c.qty,
            customsValueStr: '', dutyRateStr: '',
          })));
        }
        // 연결된 PO 단일 조회 — 전체 목록 불러오지 않음
        if (found.poIds?.[0]) {
          const poRes = await fetch(`/api/purchase-orders?id=${encodeURIComponent(found.poIds[0])}&skipNotion=1`).then(r => r.json());
          const po = poRes.data?.[0];
          if (po) setLinkedPO({ id: po.id, businessId: po.businessId, piFileUrl: po.piFileUrl, imagesJson: po.imagesJson });
        }
      }
    } finally { setShipmentLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.freightUsd, form.blNo, items.length]);

  useEffect(() => {
    if (form.shipmentBusinessId) fetchLinkedShipment(form.shipmentBusinessId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.shipmentBusinessId]);

  // 계산값
  const freightExRate = parseFloat(form.freightExchangeRate || form.exchangeRate || '0');
  const freightKrwCalc = form.freightUsd ? Math.round(parseFloat(form.freightUsd) * freightExRate) : 0;
  const effectiveFreightKrw = form.freightKrw ? parseFloat(form.freightKrw) : (freightKrwCalc || 0);
  const exRate = parseFloat(form.exchangeRate || '0');
  // 품목이 파싱된 경우 items 합계를 인보이스 금액으로 사용, 아니면 form.invoiceValue
  const itemsWithCalc = items.map(it => {
    const cv = parseFloat(it.customsValueStr || '0');        // 인보이스 화폐 (CNY 등)
    const cvKrw = exRate > 0 ? Math.round(cv * exRate) : cv; // KRW 환산
    const dr = parseFloat(it.dutyRateStr || '0');
    const d = Math.round(cvKrw * dr / 100);                  // 관세(원)
    const v = Math.round((cvKrw + d) * 0.1);                 // 부가세(원)
    return { ...it, customsValue: cv || undefined, customsValueKrw: cvKrw, dutyRate: dr || undefined, duty: d || undefined, vat: v || undefined };
  });
  const itemsHaveData = itemsWithCalc.some(i => (i.customsValue || 0) > 0);
  const totalItemCv    = itemsWithCalc.reduce((s, i) => s + (i.customsValue || 0), 0);    // 외화 합계
  const totalItemCvKrw = itemsWithCalc.reduce((s, i) => s + (i.customsValueKrw || 0), 0); // KRW 합계
  const totalItemDuty  = itemsWithCalc.reduce((s, i) => s + (i.duty || 0), 0);
  const totalItemVat   = itemsWithCalc.reduce((s, i) => s + (i.vat || 0), 0);

  const invoiceKrw = itemsHaveData
    ? totalItemCvKrw
    : parseFloat(form.invoiceValue || '0') * exRate;
  const customsValueCalc = Math.round(invoiceKrw + effectiveFreightKrw + parseFloat(form.insuranceKrw || '0'));

  const dutyCalc = itemsHaveData ? totalItemDuty : Math.round(customsValueCalc * (parseFloat(form.dutyRate || '0') / 100));
  const vatCalc  = itemsHaveData ? totalItemVat  : Math.round((customsValueCalc + dutyCalc) * 0.1);

  const inspectionFeeVal = parseFloat(form.inspectionFee || '0');
  const inspectionRefundVal = form.inspectionRefund !== '' ? parseFloat(form.inspectionRefund) : undefined;
  const brokerFeeVal     = parseFloat(form.brokerFee || '0');
  const warehouseFeeVal  = parseFloat(form.warehouseFee || '0');
  const detentionFeeVal  = parseFloat(form.detentionFee || '0');
  const demurrageVal     = parseFloat(form.demurrage || '0');
  const inlandFreightVal = parseFloat(form.inlandFreight || '0');
  const customCostsTotal = customCosts.reduce((s, c) => s + (parseFloat(c.amount || '0') || 0), 0);
  const otherCosts = inspectionFeeVal + brokerFeeVal + warehouseFeeVal + detentionFeeVal + demurrageVal + inlandFreightVal + customCostsTotal;

  const dutyFinal = parseFloat(form.duty || '0') || dutyCalc;
  const vatFinal  = parseFloat(form.vat || '0') || vatCalc;
  const totalTax  = dutyFinal + vatFinal + otherCosts;
  const refundFinal = parseFloat(form.refundAmount || '0');

  const inlandFreightRegion = selectedProvince
    ? selectedCity ? `${selectedProvince} ${selectedCity}` : selectedProvince
    : '';

  const hasCoDoc = linkedShipment?.documents?.some(d => d.docType === 'co');

  // 마감불가 조건
  const cannotClose = (() => {
    if (form.refundStatus === '신청') return 'FTA/관세 환급이 신청 중입니다. 완료 또는 없음으로 변경 후 마감하세요.';
    if (form.inspectionType !== 'none' && form.inspectionFee && parseFloat(form.inspectionFee) > 0 && form.inspectionRefund === '') {
      return '세관검사비가 있습니다. 환급금액을 확인하여 입력하세요 (없으면 0 입력).';
    }
    return null;
  })();

  // 정산서 자동 생성 (처음 열 때)
  const buildSettlementItems = useCallback((): SettlementItem[] => {
    const base: SettlementItem[] = [];
    if (dutyFinal > 0) base.push({ category: '관세', calculated: dutyFinal });
    if (vatFinal > 0) base.push({ category: '수입부가세', calculated: vatFinal });
    if (brokerFeeVal > 0) base.push({ category: '통관비(관세사)', calculated: brokerFeeVal });
    if (inspectionFeeVal > 0) base.push({ category: '세관검사비', calculated: inspectionFeeVal });
    if (warehouseFeeVal > 0) base.push({ category: 'Terminal Storage', calculated: warehouseFeeVal });
    if (demurrageVal > 0) base.push({ category: 'Demurrage/DEM', calculated: demurrageVal });
    if (detentionFeeVal > 0) base.push({ category: 'Detention/DET', calculated: detentionFeeVal });
    if (inlandFreightVal > 0) base.push({ category: `내륙운송비${inlandFreightRegion ? `(${inlandFreightRegion})` : ''}`, calculated: inlandFreightVal });
    customCosts.filter(c => c.name && parseFloat(c.amount || '0') > 0).forEach(c => {
      base.push({ category: c.name, calculated: parseFloat(c.amount) });
    });
    if (refundFinal > 0) base.push({ category: '환급(FTA/검사비)', calculated: -refundFinal });
    if (inspectionRefundVal && inspectionRefundVal > 0) base.push({ category: '검사비 환급', calculated: -inspectionRefundVal });
    return base;
  }, [dutyFinal, vatFinal, brokerFeeVal, inspectionFeeVal, warehouseFeeVal, demurrageVal, detentionFeeVal, inlandFreightVal, customCosts, refundFinal, inspectionRefundVal, inlandFreightRegion]);

  const syncSettlementItems = () => {
    const built = buildSettlementItems();
    setSettlementItems(prev => {
      return built.map(b => {
        const existing = prev.find(p => p.category === b.category);
        return existing ? { ...b, adjusted: existing.adjusted, reason: existing.reason } : b;
      });
    });
  };

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
    if (!form.shipmentBusinessId) { alert('선적 건을 선택해주세요.'); return; }
    if (!canEdit) return;
    setSaving(true);
    try {
      const linkedShp = shipments.find(s => s.businessId === form.shipmentBusinessId);
      const body = {
        ...form,
        shipmentId: linkedShp?.id || form.shipmentId || '',
        invoiceValue: itemsHaveData ? totalItemCv : (form.invoiceValue ? Number(form.invoiceValue) : undefined),
        exchangeRate: form.exchangeRate ? Number(form.exchangeRate) : undefined,
        freightUsd: form.freightUsd ? Number(form.freightUsd) : undefined,
        freightExchangeRate: form.freightExchangeRate ? Number(form.freightExchangeRate) : undefined,
        freightKrw: form.freightKrw ? Number(form.freightKrw) : (freightKrwCalc || undefined),
        insuranceKrw: form.insuranceKrw ? Number(form.insuranceKrw) : undefined,
        customsValue: customsValueCalc || undefined,  // 항상 KRW CIF 값
        dutyRate: form.dutyRate ? Number(form.dutyRate) : undefined,
        duty: form.duty ? Number(form.duty) : (dutyCalc || undefined),
        vat: form.vat ? Number(form.vat) : (vatCalc || undefined),
        brokerFee: form.brokerFee ? Number(form.brokerFee) : undefined,
        inspectionFee: form.inspectionFee ? Number(form.inspectionFee) : undefined,
        inspectionRefund: form.inspectionRefund !== '' ? Number(form.inspectionRefund) : undefined,
        warehouseFee: form.warehouseFee ? Number(form.warehouseFee) : undefined,
        detentionFee: form.detentionFee ? Number(form.detentionFee) : undefined,
        demurrage: form.demurrage ? Number(form.demurrage) : undefined,
        inlandFreight: form.inlandFreight ? Number(form.inlandFreight) : undefined,
        inlandFreightRegion: inlandFreightRegion || undefined,
        inlandCarrierId: form.inlandCarrierId || undefined,
        inlandCarrierName: form.inlandCarrierName || undefined,
        refundAmount: form.refundAmount ? Number(form.refundAmount) : undefined,
        refundStatus: form.refundStatus,
        blNo: form.blNo || undefined,
        items: itemsWithCalc.map(it => ({
          id: it.id, productName: it.productName, hsCode: it.hsCode,
          qty: it.qty, unitPrice: it.unitPrice,
          customsValue: it.customsValue, customsValueKrw: it.customsValueKrw,
          dutyRate: it.dutyRate, duty: it.duty, vat: it.vat,
        })),
        customCosts: customCosts.filter(c => c.name && parseFloat(c.amount || '0') > 0).map(c => ({ name: c.name, amount: parseFloat(c.amount) })),
        settlementItems,
      };
      let savedId = item?.id || null;
      if (item) {
        const res = await fetch(`/api/imports/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || `저장 실패 (${res.status})`); }
      } else {
        const res = await fetch('/api/imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || `등록 실패 (${res.status})`); }
        const d = await res.json();
        savedId = d.data?.id || null;
      }
      if (savedId) {
        savedIdRef.current = savedId;
        if (pendingFiles.length > 0) { await uploadDocs(savedId, pendingFiles); setPendingFiles([]); }
      }
      onSave();
    } catch (err) {
      alert(`저장 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  };

  const handleClose = async (action: 'close' | 'reopen') => {
    const id = savedIdRef.current || item?.id;
    if (!id) { alert('먼저 저장해주세요.'); return; }
    if (action === 'close' && cannotClose) { alert(`마감불가: ${cannotClose}`); return; }
    setClosing(true);
    try {
      const res = await fetch(`/api/imports/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, settlementItems }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || '처리 실패'); return; }
      setShowCloseConfirm(false);
      onSave();
    } finally { setClosing(false); }
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'basic',      label: '기본정보' },
    { key: 'tax',        label: '세금계산' },
    { key: 'settlement', label: '정산서' },
    { key: 'docs',       label: `서류${documents.length > 0 ? ` (${documents.length})` : ''}` },
  ];

  // HS코드/관세율 일괄 적용 (첫 칸 → 전체)
  const applyBulkHsRate = (hsCode: string, dutyRate: string) => {
    setItems(prev => prev.map(it => ({
      ...it,
      hsCode: it.hsCode || hsCode,
      dutyRateStr: it.dutyRateStr || dutyRate,
    })));
  };

  // 파싱 결과를 품목 테이블에 적용 (공통)
  const applyParsedItems = (d: { data?: { productName: string; hsCode?: string; dutyRate?: number; customsValue?: number; qty?: number; unitPrice?: number }[]; message?: string; count?: number }) => {
    if (d.data?.length) {
      setItems(prev => {
        const parsed = d.data!.map(it => ({
          id: `parsed-${Date.now()}-${Math.random()}`,
          productName: it.productName, hsCode: it.hsCode,
          dutyRate: it.dutyRate, customsValue: it.customsValue,
          duty: undefined, vat: undefined,
          qty: it.qty, qtyStr: it.qty?.toString() || '',
          unitPrice: it.unitPrice, unitPriceStr: it.unitPrice?.toString() || '',
          customsValueStr: it.customsValue?.toString() || '',
          dutyRateStr: it.dutyRate?.toString() || '',
        }));
        const hasData = prev.some(p => p.productName || (p.customsValue ?? 0) > 0);
        return hasData ? [...prev, ...parsed] : parsed;
      });
      setParseMsg(d.message || `${d.count ?? d.data!.length}개 파싱 완료`);
    } else {
      setParseMsg(d.message || '인식된 품목 없음');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <TruckIcon className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold">{item ? `${item.businessId} 수정` : '수입통관 등록'}</span>
            {isClosed && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full border">
                <Lock className="w-3 h-3" />마감됨
              </span>
            )}
          </div>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-muted-foreground hover:text-foreground" /></button>
        </div>

        {/* 마감 알림 배너 */}
        {isClosed && !isAdmin && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            마감된 통관건입니다. 관리자만 수정할 수 있습니다.
          </div>
        )}

        {/* 탭 */}
        <div className="flex border-b shrink-0 px-4">
          {TABS.map(t => (
            <button key={t.key} type="button"
              className={cn('py-3 px-3 text-sm border-b-2 -mb-px transition-colors', tab === t.key ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
              onClick={() => {
                setTab(t.key);
                if (t.key === 'settlement') syncSettlementItems();
              }}>{t.label}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── 기본정보 탭 ── */}
            {tab === 'basic' && (
              <div className="space-y-4">
                {/* 선적 연결 */}
                <div>
                  <label className={labelCls}>선적 번호 <span className="text-red-500">*</span></label>
                  <input list="shipment-list" className={inputCls} placeholder="SHP-2026-0001"
                    value={form.shipmentBusinessId} required disabled={!canEdit}
                    onChange={e => {
                      const v = e.target.value;
                      const s = shipments.find(s => s.businessId === v);
                      setForm(f => ({ ...f, shipmentBusinessId: v, shipmentId: s?.id || f.shipmentId }));
                    }} />
                  <datalist id="shipment-list">
                    {shipments.map(s => <option key={s.id} value={s.businessId}>{s.businessId}{s.pol && s.pod ? ` (${s.pol}→${s.pod})` : ''}</option>)}
                  </datalist>
                </div>

                {shipmentLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />선적 정보 로딩 중...</div>}
                {linkedShipment && !shipmentLoading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 text-xs">
                    <div className="font-medium text-blue-800 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />선적 참고 ({linkedShipment.businessId})</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-blue-700">
                      {linkedShipment.blNo && <div><span className="text-blue-500">B/L:</span> {linkedShipment.blNo}</div>}
                      {linkedShipment.forwarderName && <div><span className="text-blue-500">포워더:</span> {linkedShipment.forwarderName}</div>}
                      {linkedShipment.freightCost && <div><span className="text-blue-500">운임:</span> {linkedShipment.freightCurrency||'USD'} {linkedShipment.freightCost.toLocaleString()}</div>}
                      {linkedShipment.pol && linkedShipment.pod && <div><span className="text-blue-500">구간:</span> {linkedShipment.pol}→{linkedShipment.pod}</div>}
                      {linkedShipment.eta && <div><span className="text-blue-500">ETA:</span> {linkedShipment.eta}</div>}
                    </div>
                    {hasCoDoc && <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded px-2 py-1.5 text-teal-700"><CheckCircle2 className="w-3.5 h-3.5" />선적에 C/O 서류 있음</div>}
                  </div>
                )}

                {/* B/L 번호 */}
                <div>
                  <label className={labelCls}>B/L 번호 {linkedShipment?.blNo && <span className="text-blue-500 font-normal">(선적에서 자동 연동)</span>}</label>
                  <Input value={form.blNo} onChange={e => setForm(f => ({ ...f, blNo: e.target.value }))} placeholder="COSU1234567890" disabled={!canEdit} />
                </div>

                {/* 관세사 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={cn(labelCls, 'mb-0')}>관세사</label>
                      {brokers.length > 0 && <button type="button" className="text-xs text-blue-500" onClick={() => setBrokerMode(m => m === 'select' ? 'manual' : 'select')}>{brokerMode === 'select' ? '직접 입력' : '목록 선택'}</button>}
                    </div>
                    {brokerMode === 'select' && brokers.length > 0
                      ? <select value={form.brokerName} onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))} className={inputCls} disabled={!canEdit}><option value="">-- 선택 --</option>{brokers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}</select>
                      : <Input value={form.brokerName} onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))} placeholder="관세법인 대한" disabled={!canEdit} />}
                  </div>
                  <div>
                    <label className={labelCls}>신고번호</label>
                    <Input value={form.declarationNo} onChange={e => setForm(f => ({ ...f, declarationNo: e.target.value }))} placeholder="12345-26-001234" disabled={!canEdit} />
                  </div>
                </div>

                {/* 통관 단계별 날짜 */}
                <div className="bg-muted/30 rounded-lg p-3 space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">통관 단계별 날짜</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[{ label: '입항일', key: 'arrivalDate' }, { label: '신고일', key: 'declarationDate' }, { label: '납세일', key: 'taxPaymentDate' }, { label: '반출일', key: 'releaseDate' }].map(({ label, key }) => (
                      <div key={key}><label className={labelCls}>{label}</label><Input type="date" value={(form as Record<string, unknown>)[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} disabled={!canEdit} /></div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>세관검사 유형</label>
                    <select value={form.inspectionType} onChange={e => setForm(f => ({ ...f, inspectionType: e.target.value as 'none' | 'document' | 'physical' }))} className={inputCls} disabled={!canEdit}>
                      <option value="none">없음</option><option value="document">서류검사</option><option value="physical">현품검사</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>C/O 상태</label>
                    <select value={form.coStatus} onChange={e => setForm(f => ({ ...f, coStatus: e.target.value as '미수령' | '수령' | '불필요' }))} className={inputCls} disabled={!canEdit}>
                      <option>미수령</option><option>수령</option><option>불필요</option>
                    </select>
                  </div>
                </div>

                {form.coStatus !== '불필요' && (
                  <div>
                    <label className={labelCls}>C/O 번호{hasCoDoc && <span className="ml-2 text-teal-600 font-normal">선적에 C/O 서류 있음</span>}</label>
                    <Input value={form.coNo} onChange={e => setForm(f => ({ ...f, coNo: e.target.value }))} placeholder="C/O 번호 (파싱 불가 시 수동 입력)" disabled={!canEdit} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-2 cursor-pointer pb-1">
                      <input type="checkbox" checked={form.ftaApplicable} onChange={e => setForm(f => ({ ...f, ftaApplicable: e.target.checked }))} className="w-4 h-4" disabled={!canEdit} />
                      <span className="text-sm">FTA 적용</span>
                    </label>
                  </div>
                  {form.ftaApplicable && (
                    <div>
                      <label className={labelCls}>FTA 협정</label>
                      <select value={form.ftaType} onChange={e => setForm(f => ({ ...f, ftaType: e.target.value }))} className={inputCls} disabled={!canEdit}>
                        <option value="">-- 선택 --</option>
                        {FTA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelCls}>진행 상태</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Import['status'] }))} className={inputCls} disabled={!canEdit}>
                    {STATUS_STEPS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>비고</label>
                  <Input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} placeholder="특이사항" disabled={!canEdit} />
                </div>
              </div>
            )}

            {/* ── 세금계산 탭 ── */}
            {tab === 'tax' && (
              <div className="space-y-4">
                {/* 인보이스 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">① 인보이스 금액</div>
                  {linkedShipment?.documents?.some(d => d.docType === 'invoice') && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-600">
                      <FileText className="w-3.5 h-3.5" />선적 인보이스 있음 —
                      <a href={linkedShipment.documents.find(d => d.docType === 'invoice')?.url} target="_blank" rel="noopener noreferrer" className="underline">보기</a>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2"><label className={labelCls}>인보이스 금액</label><Input type="number" value={form.invoiceValue} onChange={e => setForm(f => ({ ...f, invoiceValue: e.target.value }))} placeholder="10000" disabled={!canEdit} /></div>
                    <div><label className={labelCls}>통화</label>
                      <select value={form.invoiceCurrency} onChange={e => setForm(f => ({ ...f, invoiceCurrency: e.target.value }))} className={inputCls} disabled={!canEdit}>
                        {['USD','CNY','EUR','JPY','KRW'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 환율 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">② 환율</div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1"><label className={labelCls}>인보이스 환율 (원/{form.invoiceCurrency})</label><Input type="number" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} placeholder="1380" disabled={!canEdit} /></div>
                    <Button type="button" variant="outline" size="sm" onClick={fetchRate} disabled={rateLoading || !canEdit} className="shrink-0">
                      {rateLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}관세청 환율
                    </Button>
                  </div>
                  {rateMsg && <div className={cn('text-xs px-2 py-1 rounded', rateMsg.ok ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50')}>{rateMsg.text}</div>}
                </div>

                {/* 운임 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">③ 운임</div>
                  {linkedShipment?.freightCost && (
                    <div className="text-xs text-blue-600">
                      선적 운임: {linkedShipment.freightCurrency||'USD'} {linkedShipment.freightCost.toLocaleString()}
                      {linkedShipment.freightCurrency === 'USD' && <button type="button" className="ml-2 underline hover:text-blue-800" onClick={() => setForm(f => ({ ...f, freightUsd: String(linkedShipment.freightCost) }))}>적용</button>}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <div><label className={labelCls}>운임 (USD)</label><Input type="number" value={form.freightUsd} onChange={e => setForm(f => ({ ...f, freightUsd: e.target.value }))} placeholder="1000" disabled={!canEdit} /></div>
                    <div><label className={labelCls}>운임환율</label><Input type="number" value={form.freightExchangeRate} onChange={e => setForm(f => ({ ...f, freightExchangeRate: e.target.value }))} placeholder={form.exchangeRate || '1380'} disabled={!canEdit} /></div>
                    <div><label className={labelCls}>운임 KRW (자동)</label><Input type="number" value={form.freightKrw || (freightKrwCalc > 0 ? String(freightKrwCalc) : '')} readOnly className="bg-muted" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={labelCls}>보험료 (원)</label><Input type="number" value={form.insuranceKrw} onChange={e => setForm(f => ({ ...f, insuranceKrw: e.target.value }))} placeholder="0" disabled={!canEdit} /></div>
                  </div>
                </div>

                {/* 과세가격 요약 */}
                {customsValueCalc > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
                    <div className="font-medium text-blue-800">과세가격 (CIF) 자동계산</div>
                    <div className="text-blue-700 space-y-0.5">
                      {itemsHaveData
                        ? <div>품목합계: {totalItemCv.toLocaleString()} {form.invoiceCurrency} × {exRate.toLocaleString()}원 = {totalItemCvKrw.toLocaleString()}원</div>
                        : <div>인보이스: {parseFloat(form.invoiceValue||'0').toLocaleString()} {form.invoiceCurrency} × {exRate.toLocaleString()}원 = {Math.round(invoiceKrw).toLocaleString()}원</div>
                      }
                      {effectiveFreightKrw > 0 && <div>운임: {effectiveFreightKrw.toLocaleString()}원</div>}
                      {parseFloat(form.insuranceKrw||'0') > 0 && <div>보험료: {parseFloat(form.insuranceKrw).toLocaleString()}원</div>}
                    </div>
                    <div className="text-blue-900 font-bold text-sm border-t border-blue-200 pt-1">과세가격 합계 = {customsValueCalc.toLocaleString()}원</div>
                  </div>
                )}

                {/* 품목별 세율 테이블 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">④ 품목별 관세</div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        {/* 연결된 선적 Excel 파일 바로가기 */}
                        {linkedShipment?.documents?.filter(d => /\.(xlsx|xls)$/i.test(d.originalName)).map(doc => (
                          <button key={doc.id} type="button"
                            disabled={sheetLoading === doc.filename}
                            title={doc.originalName}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border text-blue-600 border-blue-300 hover:bg-blue-50 transition-colors max-w-[140px]"
                            onClick={async () => {
                              setSheetLoading(doc.filename);
                              try {
                                const res = await fetch(`/api/shipments/${linkedShipment.id}/documents/sheets`, {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ filename: doc.filename }),
                                });
                                const d = await res.json();
                                if (d.sheets?.length > 0) {
                                  setSheetModal({ shipmentId: linkedShipment.id, filename: doc.filename, docName: doc.originalName, sheets: d.sheets });
                                } else {
                                  setParseMsg('시트를 읽을 수 없습니다');
                                  setTimeout(() => setParseMsg(null), 4000);
                                }
                              } catch { setParseMsg('파일 읽기 실패'); setTimeout(() => setParseMsg(null), 4000); }
                              finally { setSheetLoading(null); }
                            }}>
                            {sheetLoading === doc.filename ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{doc.originalName.replace(/\.[^/.]+$/, '')}</span>
                          </button>
                        ))}
                        {/* 새 엑셀 업로드 → 시트 선택 후 파싱 */}
                        <label className={cn('flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded border transition-colors',
                          parseLoading ? 'text-muted-foreground border-muted' : 'text-green-600 border-green-300 hover:bg-green-50')}>
                          <input ref={parseFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                            onChange={async e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              e.target.value = '';
                              setParseLoading(true); setParseMsg(null);
                              try {
                                const ext = file.name.split('.').pop()?.toLowerCase();
                                // CSV는 시트 없으므로 바로 파싱
                                if (ext === 'csv') {
                                  const fd = new FormData(); fd.append('file', file);
                                  const res = await fetch('/api/imports/parse-items-temp', { method: 'POST', body: fd });
                                  const d = await res.json();
                                  applyParsedItems(d);
                                  return;
                                }
                                // Excel: 먼저 시트 목록 조회
                                const fd = new FormData(); fd.append('file', file); fd.append('mode', 'sheets');
                                const res = await fetch('/api/imports/parse-items-temp', { method: 'POST', body: fd });
                                const d = await res.json();
                                if (d.sheets?.length > 0) {
                                  // 시트 수 관계없이 항상 모달에서 선택
                                  pendingExcelFileRef.current = file;
                                  setSheetModal({ shipmentId: '', filename: '__upload__', docName: file.name, sheets: d.sheets });
                                }
                              } catch (ex) { setParseMsg(`파싱 실패: ${ex}`); }
                              finally { setParseLoading(false); setTimeout(() => setParseMsg(null), 6000); }
                            }} />
                          {parseLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          엑셀 업로드
                        </label>
                        <button type="button" className="text-xs text-blue-500 hover:text-blue-700"
                          onClick={() => setItems(prev => [...prev, { id: `new-${Date.now()}`, productName: '', hsCode: '', dutyRate: undefined, customsValue: undefined, duty: undefined, vat: undefined, qty: undefined, customsValueStr: '', dutyRateStr: '' }])}>
                          + 품목 추가
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 파싱 결과 메시지 */}
                  {parseMsg && (
                    <div className={cn('text-xs px-2 py-1.5 rounded flex items-center gap-1.5',
                      parseMsg.includes('완료') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                      {parseMsg.includes('완료') ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                      {parseMsg}
                    </div>
                  )}

                  {/* HS코드/관세율 일괄 적용 */}
                  {items.length > 1 && canEdit && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs">
                      <span className="text-amber-700 font-medium shrink-0">일괄 적용:</span>
                      <input className="h-7 rounded border border-input bg-background px-2 text-xs flex-1" placeholder="HS코드 (빈 칸만 채움)"
                        id="bulk-hs" defaultValue="" onBlur={e => { if (e.target.value) applyBulkHsRate(e.target.value, (document.getElementById('bulk-dr') as HTMLInputElement)?.value || ''); }} />
                      <input id="bulk-dr" className="h-7 w-20 rounded border border-input bg-background px-2 text-xs" placeholder="관세율%" type="number"
                        onBlur={e => { if (e.target.value) applyBulkHsRate((document.getElementById('bulk-hs') as HTMLInputElement)?.value || '', e.target.value); }} />
                      <button type="button" className="px-2 py-1 bg-amber-600 text-white rounded text-[10px] shrink-0"
                        onClick={() => {
                          const hs = (document.getElementById('bulk-hs') as HTMLInputElement)?.value || '';
                          const dr = (document.getElementById('bulk-dr') as HTMLInputElement)?.value || '';
                          if (!hs && !dr) return;
                          setItems(prev => prev.map(it => ({ ...it, hsCode: hs || it.hsCode, dutyRateStr: dr || it.dutyRateStr })));
                        }}>전체</button>
                    </div>
                  )}

                  {items.length > 0 && (
                    <div className="rounded-lg border border-border overflow-x-auto text-xs">
                      <div style={{ minWidth: 820 }}>
                        <div className="grid bg-muted/50 text-muted-foreground font-medium" style={{ gridTemplateColumns: '200px 110px 70px 80px 70px 120px 100px 100px 28px' }}>
                          {['품목명', 'HS코드', '수량', '단가', '관세율%', `금액(${form.invoiceCurrency||'외화'})`, '관세(원)', '부가세(원)', ''].map(h => <div key={h} className="px-2 py-2 whitespace-nowrap">{h}</div>)}
                        </div>
                        {itemsWithCalc.map((it, idx) => {
                          // itemsWithCalc에서 이미 계산된 값 사용 (duty/vat은 KRW)
                          const qty = parseFloat(it.qtyStr || '0');
                          const up = parseFloat(it.unitPriceStr || '0');
                          const cvRaw = parseFloat(it.customsValueStr || '0');
                          const cvAuto = up > 0 && qty > 0 ? Math.round(up * qty) : 0;
                          const cvDisplay = cvRaw > 0 ? it.customsValueStr : (cvAuto > 0 ? String(cvAuto) : '');
                          const d = it.duty || 0;
                          const v = it.vat || 0;
                          return (
                            <div key={it.id} className="grid border-t border-border" style={{ gridTemplateColumns: '200px 110px 70px 80px 70px 120px 100px 100px 28px' }}>
                              <div className="px-2 py-1.5"><input autoComplete="off" className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={it.productName} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, productName: e.target.value } : p))} placeholder="품목명" disabled={!canEdit} /></div>
                              <div className="px-2 py-1.5"><input autoComplete="off" className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={it.hsCode || ''} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, hsCode: e.target.value } : p))} placeholder="선택사항" disabled={!canEdit} /></div>
                              <div className="px-2 py-1.5"><input autoComplete="off" type="number" className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={it.qtyStr || ''} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, qtyStr: e.target.value } : p))} placeholder="0" disabled={!canEdit} /></div>
                              <div className="px-2 py-1.5"><input autoComplete="off" type="number" className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={it.unitPriceStr || ''} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, unitPriceStr: e.target.value } : p))} placeholder="0" disabled={!canEdit} /></div>
                              <div className="px-2 py-1.5"><input autoComplete="off" type="number" className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={it.dutyRateStr} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, dutyRateStr: e.target.value } : p))} placeholder="8" disabled={!canEdit} /></div>
                              <div className="px-2 py-1.5"><input autoComplete="off" type="number" className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={cvDisplay} onChange={e => setItems(prev => prev.map((p, i) => i === idx ? { ...p, customsValueStr: e.target.value } : p))} placeholder="단가×수량 자동" disabled={!canEdit} /></div>
                              <div className="px-2 py-1.5 text-orange-700 font-medium flex items-center text-xs">{d > 0 ? d.toLocaleString() : '-'}</div>
                              <div className="px-2 py-1.5 text-purple-700 font-medium flex items-center text-xs">{v > 0 ? v.toLocaleString() : '-'}</div>
                              <div className="px-1 py-1.5 flex items-center">{canEdit && <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}><X className="w-3.5 h-3.5 text-red-400 hover:text-red-600" /></button>}</div>
                            </div>
                          );
                        })}
                        {items.length > 1 && (
                          <div className="grid border-t-2 border-border bg-muted/30 font-semibold" style={{ gridTemplateColumns: '200px 110px 70px 80px 70px 120px 100px 100px 28px' }}>
                            <div className="px-2 py-2 col-span-5 text-muted-foreground">합계</div>
                            <div className="px-2 py-2 text-blue-700">{totalItemCv > 0 ? totalItemCv.toLocaleString() : '-'}</div>
                            <div className="px-2 py-2 text-orange-700">{totalItemDuty > 0 ? totalItemDuty.toLocaleString() : '-'}</div>
                            <div className="px-2 py-2 text-purple-700">{totalItemVat > 0 ? totalItemVat.toLocaleString() : '-'}</div>
                            <div />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!itemsHaveData && (
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={labelCls}>HS Code (대표)</label><Input value={form.hsCode} onChange={e => setForm(f => ({ ...f, hsCode: e.target.value }))} placeholder="9405.10-0000" disabled={!canEdit} /></div>
                      <div><label className={labelCls}>관세율 % (일괄)</label><Input type="number" step="0.1" value={form.dutyRate} onChange={e => setForm(f => ({ ...f, dutyRate: e.target.value }))} placeholder="8" disabled={!canEdit} /></div>
                    </div>
                  )}
                </div>

                {/* 관세/부가세 확정 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>관세 (원){!form.duty && dutyCalc > 0 && <span className="text-blue-500 ml-1">≈{dutyCalc.toLocaleString()}</span>}</label>
                    <Input type="number" value={form.duty} onChange={e => setForm(f => ({ ...f, duty: e.target.value }))} placeholder={dutyCalc ? String(dutyCalc) : '0'} disabled={!canEdit} />
                  </div>
                  <div>
                    <label className={labelCls}>부가세 (원){!form.vat && vatCalc > 0 && <span className="text-blue-500 ml-1">≈{vatCalc.toLocaleString()}</span>}</label>
                    <Input type="number" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} placeholder={vatCalc ? String(vatCalc) : '0'} disabled={!canEdit} />
                  </div>
                </div>

                {/* 세관검사비 + 환급 */}
                {form.inspectionType !== 'none' && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-3">
                    <div className="text-xs font-medium text-purple-800">세관검사 비용</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>검사비용 (원)</label>
                        <Input type="number" value={form.inspectionFee} onChange={e => setForm(f => ({ ...f, inspectionFee: e.target.value }))} placeholder="검사비 발생 시 입력" disabled={!canEdit} />
                      </div>
                      <div>
                        <label className={cn(labelCls, 'flex items-center gap-1')}>
                          검사비 환급금액 (원)
                          {form.inspectionRefund === '' && form.inspectionFee && parseFloat(form.inspectionFee) > 0 && (
                            <span className="text-amber-600">⚠ 미확인</span>
                          )}
                        </label>
                        <Input type="number" value={form.inspectionRefund} onChange={e => setForm(f => ({ ...f, inspectionRefund: e.target.value }))} placeholder="없으면 0 입력" disabled={!canEdit} />
                      </div>
                    </div>
                    {form.inspectionRefund === '' && form.inspectionFee && parseFloat(form.inspectionFee) > 0 && (
                      <div className="text-xs text-amber-700 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />환급금액 미확인 시 마감불가. 나중에 확인 후 입력하세요.</div>
                    )}
                  </div>
                )}

                {/* 기타비용 */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">기타비용 <span className="font-normal normal-case">(부가세 비해당)</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>통관비 / 관세사 수수료 (원)</label>
                      <Input type="number" value={form.brokerFee} onChange={e => setForm(f => ({ ...f, brokerFee: e.target.value }))} placeholder="150000" disabled={!canEdit} />
                    </div>
                    <div>
                      <label className={labelCls}>Terminal Storage / 장치료 (원)</label>
                      <Input type="number" value={form.warehouseFee} onChange={e => setForm(f => ({ ...f, warehouseFee: e.target.value }))} placeholder="0" disabled={!canEdit} />
                    </div>
                    <div>
                      <label className={labelCls}>Demurrage / DEM / 체화료 (원)</label>
                      <Input type="number" value={form.demurrage} onChange={e => setForm(f => ({ ...f, demurrage: e.target.value }))} placeholder="0" disabled={!canEdit} />
                    </div>
                    <div>
                      <label className={labelCls}>Detention / DET / 지체료 (원)</label>
                      <Input type="number" value={form.detentionFee} onChange={e => setForm(f => ({ ...f, detentionFee: e.target.value }))} placeholder="0" disabled={!canEdit} />
                    </div>
                  </div>
                </div>

                {/* 내륙운송비 */}
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">내륙운송비</div>
                  {/* 운송업체 선택 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={cn(labelCls, 'mb-0')}>운송업체 (포워더/운송사)</label>
                      {carriers.length > 0 && <button type="button" className="text-xs text-blue-500" onClick={() => setCarrierMode(m => m === 'select' ? 'manual' : 'select')}>{carrierMode === 'select' ? '직접 입력' : '목록 선택'}</button>}
                    </div>
                    {carrierMode === 'select' && carriers.length > 0
                      ? <select value={form.inlandCarrierId} onChange={e => {
                          const c = carriers.find((c: Company) => c.id === e.target.value);
                          setForm(f => ({ ...f, inlandCarrierId: e.target.value, inlandCarrierName: c?.name || '' }));
                        }} className={inputCls} disabled={!canEdit}>
                          <option value="">-- 선택 --</option>
                          {carriers.map((c: Company) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                        </select>
                      : <Input value={form.inlandCarrierName} onChange={e => setForm(f => ({ ...f, inlandCarrierName: e.target.value, inlandCarrierId: '' }))} placeholder="운송업체명" disabled={!canEdit} />}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={labelCls}>시/도</label>
                      <select value={selectedProvince} onChange={e => { setSelectedProvince(e.target.value); setSelectedCity(''); }} className={inputCls} disabled={!canEdit}>
                        <option value="">-- 선택 --</option>
                        {KR_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>시/군/구</label>
                      <select value={selectedCity} onChange={e => setSelectedCity(e.target.value)} className={inputCls} disabled={!selectedProvince || !canEdit}>
                        <option value="">-- 선택 --</option>
                        {selectedProvince && KR_REGIONS[selectedProvince]?.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>운송비 (원)</label>
                      <Input type="number" value={form.inlandFreight} onChange={e => setForm(f => ({ ...f, inlandFreight: e.target.value }))} placeholder="300000" disabled={!canEdit} />
                    </div>
                  </div>
                  {inlandFreightRegion && <div className="text-xs text-muted-foreground">도착지: <strong>{inlandFreightRegion}</strong></div>}
                </div>

                {/* 기타비용 3개 자유입력 */}
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground font-medium">기타 추가비용</div>
                  {customCosts.map((c, idx) => (
                    <div key={idx} className="grid grid-cols-3 gap-2 items-end">
                      <div className="col-span-2"><label className={cn(labelCls, idx > 0 ? 'sr-only' : '')}>비용 항목명</label><Input value={c.name} onChange={e => setCustomCosts(prev => prev.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))} placeholder={`기타비용 ${idx + 1}`} disabled={!canEdit} /></div>
                      <div><label className={cn(labelCls, idx > 0 ? 'sr-only' : '')}>금액 (원)</label><Input type="number" value={c.amount} onChange={e => setCustomCosts(prev => prev.map((p, i) => i === idx ? { ...p, amount: e.target.value } : p))} placeholder="0" disabled={!canEdit} /></div>
                    </div>
                  ))}
                </div>

                {/* 총납부 요약 */}
                {(customsValueCalc > 0 || totalTax > 0) && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-xs">
                    {dutyFinal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">관세</span><span>{dutyFinal.toLocaleString()}원</span></div>}
                    {vatFinal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">수입부가세</span><span>{vatFinal.toLocaleString()}원</span></div>}
                    {inspectionFeeVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">세관검사비</span><span>{inspectionFeeVal.toLocaleString()}원</span></div>}
                    {brokerFeeVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">통관비</span><span>{brokerFeeVal.toLocaleString()}원</span></div>}
                    {warehouseFeeVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Terminal Storage</span><span>{warehouseFeeVal.toLocaleString()}원</span></div>}
                    {demurrageVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Demurrage/DEM</span><span>{demurrageVal.toLocaleString()}원</span></div>}
                    {detentionFeeVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Detention/DET</span><span>{detentionFeeVal.toLocaleString()}원</span></div>}
                    {inlandFreightVal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">내륙운송비{inlandFreightRegion ? ` (${inlandFreightRegion})` : ''}</span><span>{inlandFreightVal.toLocaleString()}원</span></div>}
                    {customCosts.filter(c => c.name && parseFloat(c.amount||'0') > 0).map((c, i) => <div key={i} className="flex justify-between"><span className="text-muted-foreground">{c.name}</span><span>{parseFloat(c.amount).toLocaleString()}원</span></div>)}
                    <div className="flex justify-between items-center border-t border-border pt-1.5 mt-1"><span className="font-semibold">총 납부액</span><span className="text-lg font-bold text-red-600">{totalTax.toLocaleString()}원</span></div>
                    {refundFinal > 0 && <div className="flex justify-between text-green-700"><span>FTA 환급</span><span className="font-bold">-{refundFinal.toLocaleString()}원</span></div>}
                    {inspectionRefundVal !== undefined && inspectionRefundVal > 0 && <div className="flex justify-between text-green-700"><span>검사비 환급</span><span className="font-bold">-{inspectionRefundVal.toLocaleString()}원</span></div>}
                    {(refundFinal > 0 || (inspectionRefundVal || 0) > 0) && <div className="flex justify-between border-t border-border pt-1.5 font-bold text-green-800"><span>환급 후 실납부</span><span>{(totalTax - refundFinal - (inspectionRefundVal || 0)).toLocaleString()}원</span></div>}
                  </div>
                )}

                {/* FTA 환급 */}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>FTA 환급액 (원)</label><Input type="number" value={form.refundAmount} onChange={e => setForm(f => ({ ...f, refundAmount: e.target.value }))} placeholder="FTA 사후 환급 등" disabled={!canEdit} /></div>
                  <div>
                    <label className={labelCls}>환급 상태</label>
                    <select value={form.refundStatus} onChange={e => setForm(f => ({ ...f, refundStatus: e.target.value as '없음' | '신청' | '완료' }))} className={inputCls} disabled={!canEdit}>
                      <option value="없음">없음</option><option value="신청">신청</option><option value="완료">완료</option>
                    </select>
                  </div>
                </div>
                {form.refundStatus === '신청' && <div className="text-xs text-amber-700 flex items-center gap-1 bg-amber-50 border border-amber-200 rounded px-2 py-1.5"><AlertCircle className="w-3.5 h-3.5" />환급 신청 중 — 완료 처리 전까지 마감불가</div>}
              </div>
            )}

            {/* ── 정산서 탭 ── */}
            {tab === 'settlement' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">정산서</div>
                  <button type="button" onClick={syncSettlementItems} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />최신 금액 반영
                  </button>
                </div>

                {cannotClose && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div><strong>마감불가:</strong> {cannotClose}</div>
                  </div>
                )}

                {isClosed && (
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
                    <Lock className="w-3.5 h-3.5" />
                    {item?.closedAt ? new Date(item.closedAt).toLocaleString('ko-KR') : ''} 마감 완료
                    {isAdmin && (
                      <button type="button" onClick={() => handleClose('reopen')} disabled={closing}
                        className="ml-auto text-xs px-2 py-0.5 bg-gray-200 hover:bg-gray-300 rounded">
                        마감 해제 (관리자)
                      </button>
                    )}
                  </div>
                )}

                {/* 정산 항목 테이블 */}
                {settlementItems.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    <button type="button" onClick={syncSettlementItems} className="px-4 py-2 border border-dashed rounded-lg hover:bg-muted">
                      세금계산 탭 금액으로 정산서 초기화
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden text-xs">
                    <div className="grid bg-muted/50 text-muted-foreground font-medium" style={{ gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 2fr' }}>
                      {['비용 항목', '계산금액', '조정금액', '차이', '조정사유'].map(h => <div key={h} className="px-2 py-2">{h}</div>)}
                    </div>
                    {settlementItems.map((si, idx) => {
                      const adj = si.adjusted !== undefined ? si.adjusted : si.calculated;
                      const diff = adj - si.calculated;
                      return (
                        <div key={idx} className={cn('grid border-t border-border', si.calculated < 0 ? 'bg-green-50' : '')} style={{ gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 2fr' }}>
                          <div className="px-2 py-1.5 font-medium flex items-center">{si.category}</div>
                          <div className="px-2 py-1.5 flex items-center text-muted-foreground">{si.calculated.toLocaleString()}원</div>
                          <div className="px-2 py-1.5">
                            {canEdit && !isClosed
                              ? <input type="number" className="w-full h-7 rounded border border-input bg-background px-2 text-xs"
                                  value={si.adjusted !== undefined ? si.adjusted : ''} placeholder={String(si.calculated)}
                                  onChange={e => setSettlementItems(prev => prev.map((p, i) => i === idx ? { ...p, adjusted: e.target.value ? Number(e.target.value) : undefined } : p))} />
                              : <span>{adj.toLocaleString()}원</span>}
                          </div>
                          <div className={cn('px-2 py-1.5 flex items-center font-medium', diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-muted-foreground')}>
                            {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toLocaleString()}원` : '-'}
                          </div>
                          <div className="px-2 py-1.5">
                            {canEdit && !isClosed
                              ? <input className="w-full h-7 rounded border border-input bg-background px-2 text-xs" value={si.reason || ''} placeholder="조정사유"
                                  onChange={e => setSettlementItems(prev => prev.map((p, i) => i === idx ? { ...p, reason: e.target.value } : p))} />
                              : <span className="text-muted-foreground">{si.reason || '-'}</span>}
                          </div>
                        </div>
                      );
                    })}
                    {/* 합계 */}
                    {(() => {
                      const totalCalc = settlementItems.reduce((s, si) => s + si.calculated, 0);
                      const totalAdj = settlementItems.reduce((s, si) => s + (si.adjusted !== undefined ? si.adjusted : si.calculated), 0);
                      const totalDiff = totalAdj - totalCalc;
                      return (
                        <div className="grid border-t-2 border-border bg-muted/40 font-semibold" style={{ gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 2fr' }}>
                          <div className="px-2 py-2">합계</div>
                          <div className="px-2 py-2">{totalCalc.toLocaleString()}원</div>
                          <div className="px-2 py-2">{totalAdj.toLocaleString()}원</div>
                          <div className={cn('px-2 py-2', totalDiff > 0 ? 'text-red-600' : totalDiff < 0 ? 'text-green-600' : '')}>{totalDiff !== 0 ? `${totalDiff > 0 ? '+' : ''}${totalDiff.toLocaleString()}원` : '-'}</div>
                          <div />
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 마감 버튼 */}
                {!isClosed && canEdit && (
                  <div>
                    {showCloseConfirm ? (
                      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
                        <div className="text-sm font-semibold text-amber-800">마감하시겠습니까?</div>
                        <div className="text-xs text-amber-700">마감 후에는 관리자만 수정할 수 있습니다. 모든 비용이 재무에 확정 기록됩니다.</div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowCloseConfirm(false)}>취소</Button>
                          <Button type="button" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleClose('close')} disabled={closing}>
                            {closing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '마감 확정'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" className="w-full border-amber-400 text-amber-700 hover:bg-amber-50"
                        onClick={() => { if (cannotClose) { alert(`마감불가: ${cannotClose}`); return; } setShowCloseConfirm(true); }}>
                        <Lock className="w-4 h-4 mr-2" />정산 마감
                      </Button>
                    )}
                  </div>
                )}

                {/* 히스토리 */}
                {settlementHistory.length > 0 && (
                  <div>
                    <button type="button" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowHistory(h => !h)}>
                      <History className="w-3.5 h-3.5" />히스토리 ({settlementHistory.length})
                      {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    {showHistory && (
                      <div className="mt-2 space-y-1">
                        {[...settlementHistory].reverse().map((h, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1 bg-muted/30 rounded">
                            <span className="shrink-0">{new Date(h.at).toLocaleString('ko-KR')}</span>
                            <span className="shrink-0 font-medium text-foreground">{h.by}</span>
                            <span className="px-1.5 py-0.5 bg-background border rounded-full text-[10px]">{h.action}</span>
                            {h.note && <span className="text-muted-foreground truncate">{h.note}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 서류 탭 ── */}
            {tab === 'docs' && (
              <div className="space-y-4">
                {/* ── 시트 선택 모달 ── */}
                {sheetModal && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setSheetModal(null)}>
                    <div className="bg-card border border-border rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
                      <div className="text-sm font-semibold mb-1">인보이스 시트 선택</div>
                      <div className="text-xs text-muted-foreground mb-3 truncate">{sheetModal.docName}</div>
                      <div className="space-y-1.5">
                        {sheetModal.sheets.map(sheet => (
                          <button key={sheet} type="button"
                            className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-primary hover:text-primary-foreground text-sm transition-colors"
                            onClick={async () => {
                              const modal = sheetModal!;
                              setSheetModal(null);
                              setTab('tax');
                              setParseLoading(true); setParseMsg(null);
                              try {
                                let d: { data?: { productName: string; hsCode?: string; dutyRate?: number; customsValue?: number; qty?: number }[]; message?: string; count?: number };

                                if (modal.filename === '__upload__' && pendingExcelFileRef.current) {
                                  // 업로드한 새 파일 파싱 (서버에 없음)
                                  const fd = new FormData();
                                  fd.append('file', pendingExcelFileRef.current);
                                  fd.append('mode', 'parse');
                                  fd.append('sheet', sheet);
                                  const res = await fetch('/api/imports/parse-items-temp', { method: 'POST', body: fd });
                                  d = await res.json();
                                  pendingExcelFileRef.current = null;
                                } else {
                                  // 선적 서류 파일 파싱
                                  const res = await fetch(`/api/shipments/${modal.shipmentId}/documents/parse-items`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ filename: modal.filename, sheet }),
                                  });
                                  d = await res.json();
                                }

                                applyParsedItems({ ...d, message: `[${sheet}] ${d.message || (d.data?.length ? `${d.data.length}개 파싱 완료` : '인식된 품목 없음')}` });
                                if (d.data?.length) setTab('tax');
                              } catch (ex) { setParseMsg(`파싱 실패: ${ex}`); }
                              finally { setParseLoading(false); setTimeout(() => setParseMsg(null), 6000); }
                            }}>
                            {sheet}
                          </button>
                        ))}
                      </div>
                      <button type="button" className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground" onClick={() => setSheetModal(null)}>취소</button>
                    </div>
                  </div>
                )}

                {/* ── PO / PI 서류 ── */}
                {linkedPO && (() => {
                  const imgs: string[] = (() => { try { return JSON.parse(linkedPO.imagesJson || '[]'); } catch { return []; } })();
                  const allFiles: { url: string; name: string }[] = [
                    ...(linkedPO.piFileUrl ? [{ url: linkedPO.piFileUrl, name: 'PI / Proforma Invoice' }] : []),
                    ...imgs.map((url, i) => ({ url, name: `발주서 첨부 ${i + 1}` })),
                  ];
                  return (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                        <FileText className="w-3.5 h-3.5 text-orange-500" />
                        <span>PO/PI 서류</span>
                        <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">{linkedPO.businessId}</span>
                      </div>
                      {allFiles.length > 0 ? allFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-100 rounded-lg text-xs">
                          <FileText className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span className="flex-1 truncate text-orange-900 font-medium">{f.name}</span>
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-700 shrink-0">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )) : (
                        <div className="px-3 py-2 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-700 flex items-center gap-2">
                          <Info className="w-3.5 h-3.5 shrink-0 text-orange-400" />
                          <span>PO에 첨부된 PI/서류 파일이 없습니다.</span>
                          <a href={`/dashboard/purchase-orders`} target="_blank" rel="noopener noreferrer"
                            className="ml-auto text-orange-500 underline hover:text-orange-700 whitespace-nowrap">PO에서 추가 →</a>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── 선적 서류 ── */}
                {linkedShipment?.documents?.length ? (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                      <Info className="w-3.5 h-3.5 text-blue-500" />
                      <span>선적 서류</span>
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{linkedShipment.businessId}</span>
                    </div>
                    {linkedShipment.documents.map(doc => {
                      const isExcel = /\.(xlsx|xls)$/i.test(doc.originalName);
                      const isBL = doc.docType === 'bl';
                      const typeLabel = doc.docType === 'invoice' ? '인보이스' : doc.docType === 'packing_list' ? '패킹리스트' : isBL ? 'B/L' : doc.docType === 'co' ? 'C/O' : '기타';
                      const typeColor = isBL ? 'bg-indigo-100 text-indigo-700' : doc.docType === 'invoice' || doc.docType === 'packing_list' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-600';
                      return (
                        <div key={doc.id} className={cn('flex items-center gap-2 px-3 py-2 border rounded-lg text-xs',
                          isBL ? 'bg-indigo-50 border-indigo-100' : 'bg-blue-50 border-blue-100')}>
                          <FileText className={cn('w-3.5 h-3.5 shrink-0', isBL ? 'text-indigo-400' : 'text-blue-400')} />
                          <span className={cn('flex-1 truncate font-medium', isBL ? 'text-indigo-900' : 'text-blue-900')}>{doc.originalName}</span>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0', typeColor)}>{typeLabel}</span>
                          {/* Excel CI/PL → 파싱 버튼 */}
                          {isExcel && (doc.docType === 'invoice' || doc.docType === 'packing_list' || doc.docType === 'other') && (
                            <button type="button" title="시트 선택 후 품목 파싱"
                              className="text-teal-600 hover:text-teal-800 shrink-0 flex items-center gap-0.5"
                              disabled={sheetLoading === doc.filename}
                              onClick={async () => {
                                setSheetLoading(doc.filename);
                                try {
                                  const res = await fetch(`/api/shipments/${linkedShipment.id}/documents/sheets`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ filename: doc.filename }),
                                  });
                                  const d = await res.json();
                                  if (d.sheets?.length === 1) {
                                    // 시트 1개면 바로 파싱
                                    setTab('tax');
                                    setSheetModal({ shipmentId: linkedShipment.id, filename: doc.filename, docName: doc.originalName, sheets: d.sheets });
                                  } else if (d.sheets?.length > 1) {
                                    setTab('tax');
                                    setSheetModal({ shipmentId: linkedShipment.id, filename: doc.filename, docName: doc.originalName, sheets: d.sheets });
                                  } else {
                                    setParseMsg('시트 목록을 읽을 수 없습니다');
                                    setTimeout(() => setParseMsg(null), 4000);
                                  }
                                } catch { setParseMsg('파일 읽기 실패'); setTimeout(() => setParseMsg(null), 4000); }
                                finally { setSheetLoading(null); }
                              }}>
                              {sheetLoading === doc.filename ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                              <span className="text-[10px]">파싱</span>
                            </button>
                          )}
                          <a href={doc.url} target="_blank" rel="noopener noreferrer"
                            className={cn('shrink-0', isBL ? 'text-indigo-500 hover:text-indigo-700' : 'text-blue-500 hover:text-blue-700')}>
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {/* 통관 서류 업로드 */}
                <div>
                  {(linkedPO || linkedShipment?.documents?.length) ? <div className="text-xs font-semibold text-muted-foreground mb-2">통관 서류 업로드</div> : null}
                  {canEdit && (
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
                  )}
                </div>

                {pendingFiles.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-blue-600 font-medium">저장 시 업로드 예정 ({pendingFiles.length}개)</div>
                    {pendingFiles.map(({ file, docType }, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                        <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]', DOC_TYPE_COLOR[docType])}>{DOC_TYPE_LABEL[docType]}</span>
                        {canEdit && <button type="button" onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))}><X className="w-3 h-3 text-gray-400 hover:text-red-500" /></button>}
                      </div>
                    ))}
                  </div>
                )}

                {documents.length > 0 ? (
                  <div className="space-y-1.5">
                    {documents.map(doc => (
                      <div key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg border border-border">
                        {doc.originalName.match(/\.pdf$/i) ? <FileText className="w-4 h-4 text-red-500 shrink-0" /> : <File className="w-4 h-4 text-green-600 shrink-0" />}
                        <span className="flex-1 text-xs truncate">{doc.originalName}</span>
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
                        {canEdit && <button type="button" onClick={() => deleteDoc(doc.id)} className="text-red-400 hover:text-red-600 shrink-0"><X className="w-3.5 h-3.5" /></button>}
                      </div>
                    ))}
                  </div>
                ) : (
                  !pendingFiles.length && <div className="py-8 text-center text-xs text-muted-foreground">서류를 업로드하세요 (수입면장, 납세고지서, C/O 등)</div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 p-4 border-t sticky bottom-0 bg-background shrink-0">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>닫기</Button>
            {canEdit && (
              <Button type="submit" className="flex-1" disabled={saving || !form.shipmentBusinessId}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '저장' : '등록')}
              </Button>
            )}
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
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Import['status'] | 'all'>('all');
  const [modal, setModal] = useState<{ open: boolean; item?: Import | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const [impRes, shpRes, meRes] = await Promise.all([
      fetch('/api/imports').then(r => r.json()),
      fetch('/api/shipments').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ]);
    if (impRes.data) setImports(impRes.data);
    if (shpRes.data) setShipments(shpRes.data.map((s: Shipment) => ({
      id: s.id, businessId: s.businessId, forwarderName: s.forwarderName,
      pol: s.pol, pod: s.pod, etd: s.etd,
    })));
    if (meRes.user) setCurrentUser(meRes.user);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('통관 내역을 삭제하시겠습니까?')) return;
    await fetch(`/api/imports/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = imports.filter(imp => {
    if (statusFilter !== 'all' && imp.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        imp.businessId.toLowerCase().includes(q) ||
        imp.shipmentBusinessId.toLowerCase().includes(q) ||
        (imp.declarationNo || '').toLowerCase().includes(q) ||
        (imp.brokerName || '').toLowerCase().includes(q) ||
        (imp.blNo || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalTax = imports.reduce((s, imp) => {
    const d = imp.duty || 0;
    const v = imp.vat || 0;
    return s + d + v;
  }, 0);

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="수입통관"
        icon={<TruckIcon className="w-5 h-5" />}
        actions={
          <Button size="sm" onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4 mr-1" />통관 등록
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '전체', val: imports.length, color: 'text-blue-600' },
            { label: '진행중', val: imports.filter(i => i.status !== 'completed').length, color: 'text-yellow-600' },
            { label: '완료', val: imports.filter(i => i.status === 'completed').length, color: 'text-green-600' },
            { label: '이달 납부세액', val: `${totalTax.toLocaleString()}원`, color: 'text-red-600' },
          ].map(k => (
            <div key={k.label} className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className={cn('text-xl font-bold mt-0.5', k.color)}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* 필터 */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="통관번호, 선적번호, B/L, 관세사 검색" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as Import['status'] | 'all')} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">전체 상태</option>
            {STATUS_STEPS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">통관 내역이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(imp => (
              <div key={imp.id} className={cn('bg-card border border-border rounded-lg p-4 hover:shadow-sm transition-shadow', imp.settlementStatus === 'closed' ? 'border-gray-300 bg-gray-50/50' : '')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{imp.businessId}</span>
                      <span className="text-xs text-muted-foreground">← {imp.shipmentBusinessId}</span>
                      {imp.blNo && <span className="text-xs text-muted-foreground">B/L: {imp.blNo}</span>}
                      {imp.settlementStatus === 'closed' && <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full border"><Lock className="w-2.5 h-2.5" />마감</span>}
                      <StatusSteps status={imp.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {imp.brokerName && <span>관세사: {imp.brokerName}</span>}
                      {imp.declarationNo && <span>신고: {imp.declarationNo}</span>}
                      {imp.arrivalDate && <span>입항: {imp.arrivalDate}</span>}
                      {imp.releaseDate && <span>반출: {imp.releaseDate}</span>}
                    </div>
                    <div className="text-xs mt-1.5 flex gap-3 flex-wrap">
                      {((imp.duty || 0) + (imp.vat || 0)) > 0 && <span className="text-red-600 font-medium">납부세액: {((imp.duty || 0) + (imp.vat || 0)).toLocaleString()}원</span>}
                      {imp.refundAmount && imp.refundAmount > 0 && <span className="text-green-600">환급: {imp.refundAmount.toLocaleString()}원</span>}
                      {imp.refundStatus === '신청' && <span className="text-amber-600">환급신청중</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setModal({ open: true, item: imp })} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(imp.id)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal.open && (
        <ImportModal
          item={modal.item}
          shipments={shipments}
          currentUser={currentUser}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }}
        />
      )}
    </div>
  );
}
