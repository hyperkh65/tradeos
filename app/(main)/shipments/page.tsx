'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Ship, Plus, Search, X, Loader2, Pencil, Trash2, Upload,
  ExternalLink, RefreshCw, Plus as PlusIcon, Minus, CheckCircle2, AlertCircle,
  FileText, Download, File,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { openAppUrl } from '@/lib/tauri-print';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Shipment, CargoItem, ShipDocument, ShipDocType, PurchaseOrder } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  booked: 'bg-blue-100 text-blue-700',
  departed: 'bg-cyan-100 text-cyan-700',
  in_transit: 'bg-purple-100 text-purple-700',
  arrived: 'bg-green-100 text-green-700',
  customs: 'bg-orange-100 text-orange-700',
  completed: 'bg-gray-100 text-gray-600',
};
const STATUS_LABEL: Record<string, string> = {
  booked: '예약', departed: '출발', in_transit: '운송중',
  arrived: '도착', customs: '통관', completed: '완료',
};
const TYPE_STYLE: Record<string, string> = {
  FCL: 'bg-blue-50 text-blue-700', LCL: 'bg-green-50 text-green-700',
  AIR: 'bg-purple-50 text-purple-700', COURIER: 'bg-orange-50 text-orange-700',
};

const COMMON_PORTS = [
  'CNNGB', 'CNSHA', 'CNTAO', 'CNSZX', 'CNGZH', 'CNTXG', 'CNXMN',
  'KRPUS', 'KRINC', 'KRKAN',
  'JPOSA', 'JPTYO', 'SGSIN', 'USLAX', 'USNYC', 'NLRTM',
];

function newCargoItem(): CargoItem {
  return {
    id: Math.random().toString(36).slice(2),
    productName: '',
    supplierName: '',
    poBusinessId: '',
    qty: undefined,
    grossWeight: undefined,
    netWeight: undefined,
    cbm: undefined,
    remark: '',
  };
}

// ─── BL Lookup badge ──────────────────────────────────────────────────────────

function BlLookupBadge({ carrierName, trackingUrl }: { carrierName?: string | null; trackingUrl?: string | null }) {
  if (!carrierName) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
      {carrierName}
      {trackingUrl && (
        <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-900">
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const CONTAINER_TYPES = ['20GP','40GP','40HQ','45HQ','20RF','40RF','20OT','40OT','20FR','40FR','LCL'];

interface ShipForm {
  type: string; status: string;
  forwarderName: string;
  pol: string; pod: string;
  etd: string; eta: string;
  vessel: string; voyage: string;
  blNo: string; containerNo: string; containerType: string;
  cbm: string; grossWeight: string;
  freightCost: string; freightCurrency: string;
  cargoItems: CargoItem[];
}

function ShipmentModal({
  item, onClose, onSave,
}: { item?: Shipment | null; onClose: () => void; onSave: () => void }) {
  const [forwarders, setForwarders] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/companies?type=포워더').then(r => r.json()).then(d => {
      if (Array.isArray(d.data)) setForwarders(d.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
    fetch('/api/companies?type=공급업체').then(r => r.json()).then(d => {
      if (Array.isArray(d.data)) setSuppliers(d.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);

  // 공급사 선택 시 해당 PO 목록 로드 — 로드된 목록 반환
  const loadPOsForSupplier = async (supplierName: string): Promise<PurchaseOrder[]> => {
    if (!supplierName) return [];
    if (posBySupplier[supplierName]?.length) return posBySupplier[supplierName];
    try {
      const d = await fetch(`/api/purchase-orders?supplierName=${encodeURIComponent(supplierName)}`).then(r => r.json());
      if (Array.isArray(d.data) && d.data.length > 0) {
        setPosBySupplier(prev => ({ ...prev, [supplierName]: d.data as PurchaseOrder[] }));
        return d.data as PurchaseOrder[];
      }
    } catch { /* ignore */ }
    return [];
  };

  // 내부 PO 선택 시 미리보기 + cargoItem 업데이트 — 계약관리(PI)에서 그 PO에 PI번호가
  // 이미 연결되어 있으면 내부 PI도 자동으로 같이 채운다(요청사항: PO/PI 중 하나만 입력해도
  // 쌍으로 연결되어 있으면 자동 입력).
  const handleLinkedPoSelect = (idx: number, supplierName: string, linkedPoBusinessId: string) => {
    const pos = posBySupplier[supplierName] || [];
    const found = pos.find(p => p.businessId === linkedPoBusinessId);
    updateCargoItem(idx, { linkedPoBusinessId, linkedPiNumber: found?.piNumber || undefined });
    setPoPreview(found || null);
  };

  // 내부 PI 선택 시 — 같은 공급사의 PO 중 해당 PI번호와 연결된 PO가 있으면 내부 PO도 자동 연결.
  const handleLinkedPiSelect = (idx: number, supplierName: string, linkedPiNumber: string) => {
    const pos = posBySupplier[supplierName] || [];
    const found = pos.find(p => p.piNumber === linkedPiNumber);
    updateCargoItem(idx, { linkedPiNumber, ...(found ? { linkedPoBusinessId: found.businessId } : {}) });
    if (found) setPoPreview(found);
  };

  const [form, setForm] = useState<ShipForm>({
    type: item?.type || 'LCL',
    status: item?.status || 'booked',
    forwarderName: item?.forwarderName || '',
    pol: item?.pol || '',
    pod: item?.pod || '',
    etd: item?.etd || '',
    eta: item?.eta || '',
    vessel: item?.vessel || '',
    voyage: item?.voyage || '',
    blNo: item?.blNo || '',
    containerNo: item?.containerNo || '',
    containerType: item?.containerType || '',
    cbm: item?.cbm?.toString() || '',
    grossWeight: item?.grossWeight?.toString() || '',
    freightCost: item?.freightCost?.toString() || '',
    freightCurrency: item?.freightCurrency || 'USD',
    cargoItems: item?.cargoItems?.length ? item.cargoItems : [newCargoItem()],
  });

  const [saving, setSaving] = useState(false);
  const [blLookup, setBlLookup] = useState<{ carrierName?: string | null; trackingUrl?: string | null; source?: string; ship24Missing?: boolean; events?: { date: string; location: string; desc: string }[] } | null>(null);
  const [blLoading, setBlLoading] = useState(false);
  const [blPdfUploading, setBlPdfUploading] = useState(false);
  const [blPdfMsg, setBlPdfMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [plUploading, setPlUploading] = useState(false);
  const [plMsg, setPlMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // 시트 선택
  const [plSheets, setPlSheets] = useState<{ index: number; name: string }[]>([]);
  const [plPendingFile, setPlPendingFile] = useState<File | null>(null);
  // 공급업체 + PO 데이터
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [posBySupplier, setPosBySupplier] = useState<Record<string, PurchaseOrder[]>>({});
  const [poPreview, setPoPreview] = useState<PurchaseOrder | null>(null); // 선택된 PO 미리보기
  const [documents, setDocuments] = useState<ShipDocument[]>(item?.documents || []);
  const [docUploading, setDocUploading] = useState(false);
  const [docMsg, setDocMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]); // 저장 전 대기 파일
  const [savedId, setSavedId] = useState<string | null>(item?.id || null);
  const fileRef = useRef<HTMLInputElement>(null);
  const blPdfRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

  // Auto-compute totals from cargo items
  const totalGW = form.cargoItems.reduce((s, i) => s + (i.grossWeight || 0), 0);
  const totalCBM = form.cargoItems.reduce((s, i) => s + (i.cbm || 0), 0);

  const lookupBL = useCallback(async () => {
    const bl = form.blNo.trim();
    if (!bl) return;
    setBlLoading(true);
    try {
      const res = await fetch(`/api/shipments/bl-lookup?bl=${encodeURIComponent(bl)}`);
      const d = await res.json();
      setBlLookup({ carrierName: d.carrierName, trackingUrl: d.trackingUrl, source: d.source, ship24Missing: d.ship24Missing, events: d.events });
      if (d.source) {
        setForm(f => ({
          ...f,
          vessel: d.vessel || f.vessel,
          voyage: d.voyage || f.voyage,
          pol: d.pol || f.pol,
          pod: d.pod || f.pod,
          etd: d.etd ? d.etd.slice(0, 10) : f.etd,
          eta: d.eta ? d.eta.slice(0, 10) : f.eta,
        }));
      }
    } catch { /* ignore */ } finally {
      setBlLoading(false);
    }
  }, [form.blNo]);

  const uploadBlPdf = async (file: File) => {
    setBlPdfUploading(true);
    setBlPdfMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/shipments/parse-bl', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { data: d } = await res.json();

      const filled: string[] = [];
      setForm(f => {
        const next = { ...f };
        if (d.blNo && !f.blNo) { next.blNo = d.blNo; filled.push('B/L No'); }
        if (d.vessel) { next.vessel = d.vessel; filled.push('선박명'); }
        if (d.voyage) { next.voyage = d.voyage; filled.push('항차'); }
        if (d.pol) { next.pol = d.pol; filled.push('POL'); }
        if (d.pod) { next.pod = d.pod; filled.push('POD'); }
        if (d.etd) { next.etd = d.etd; filled.push('ETD'); }
        if (d.grossWeight) { next.grossWeight = String(d.grossWeight); filled.push('중량'); }
        if (d.cbm) { next.cbm = String(d.cbm); filled.push('CBM'); }
        if (d.containerNo && !f.containerNo) { next.containerNo = d.containerNo; filled.push('컨테이너'); }
        return next;
      });

      if (filled.length > 0) {
        setBlPdfMsg({ text: `자동 완성: ${filled.join(', ')}`, ok: true });
      } else {
        setBlPdfMsg({ text: 'B/L 정보를 자동으로 찾지 못했습니다. 직접 입력해 주세요.', ok: false });
      }
    } catch (e) {
      setBlPdfMsg({ text: `파싱 오류: ${e}`, ok: false });
    } finally {
      setBlPdfUploading(false);
    }
  };

  const uploadPackingList = async (file: File, sheetIndex?: number) => {
    setPlUploading(true);
    setPlMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (sheetIndex !== undefined) fd.append('sheetIndex', String(sheetIndex));
      const res = await fetch('/api/shipments/parse-packing-list', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();

      // 시트 목록 저장 (시트 선택 UI용)
      if (d.sheets?.length > 1) {
        setPlSheets(d.sheets);
        setPlPendingFile(file);
      } else {
        setPlSheets([]);
        setPlPendingFile(null);
      }

      if (d.items?.length > 0) {
        setForm(f => ({
          ...f,
          cargoItems: d.items,
          grossWeight: d.totalGrossWeight ? String(d.totalGrossWeight) : f.grossWeight,
          cbm: d.totalCbm ? String(d.totalCbm) : f.cbm,
          containerNo: d.containerNo || f.containerNo,
        }));
        const sheetInfo = d.parsedSheet ? ` [${d.parsedSheet.name}]` : '';
        const extra = d.containerNo ? ` · 컨테이너 ${d.containerNo}` : '';
        setPlMsg({ text: `${d.items.length}개 품목 추출 완료 (총 ${d.totalGrossWeight}kg, ${d.totalCbm}CBM)${extra}${sheetInfo}`, ok: true });

        // 파싱된 공급사별로 PO 자동 로드 + 파싱 PO번호와 일치하면 내부 PO 자동 연결
        const uniqueSuppliers = [...new Set<string>(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (d.items as any[]).map(i => i.supplierName).filter((s: unknown) => typeof s === 'string' && s)
        )];
        (async () => {
          let firstPreview = true;
          for (const supplier of uniqueSuppliers) {
            const pos = await loadPOsForSupplier(supplier);
            if (pos.length === 0) continue;
            setForm(f => {
              let previewSet = false;
              const updated = f.cargoItems.map(item => {
                if (item.supplierName !== supplier || item.linkedPoBusinessId) return item;
                const matched = pos.find((p: PurchaseOrder) => p.businessId === item.poBusinessId);
                if (matched) {
                  if (firstPreview && !previewSet) { setPoPreview(matched); previewSet = true; }
                  return { ...item, linkedPoBusinessId: matched.businessId };
                }
                return item;
              });
              if (previewSet) firstPreview = false;
              return { ...f, cargoItems: updated };
            });
          }
        })();
      } else {
        setPlMsg({ text: '자동 추출 실패 — 직접 입력해주세요', ok: false });
      }
    } catch (e) {
      setPlMsg({ text: `파싱 오류: ${e}`, ok: false });
    } finally {
      setPlUploading(false);
    }
  };

  const updateCargoItem = (idx: number, patch: Partial<CargoItem>) => {
    setForm(f => ({
      ...f,
      cargoItems: f.cargoItems.map((item, i) => i === idx ? { ...item, ...patch } : item),
    }));
  };

  const addCargoItem = () => setForm(f => ({ ...f, cargoItems: [...f.cargoItems, newCargoItem()] }));
  const removeCargoItem = (idx: number) => setForm(f => ({ ...f, cargoItems: f.cargoItems.filter((_, i) => i !== idx) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        cbm: form.cbm ? Number(form.cbm) : totalCBM || undefined,
        grossWeight: form.grossWeight ? Number(form.grossWeight) : totalGW || undefined,
        freightCost: form.freightCost ? Number(form.freightCost) : undefined,
        cargoItems: form.cargoItems.filter(i => i.productName.trim()),
        containerType: form.containerType || undefined,
      };
      let shpId = item?.id || null;
      if (item) {
        await fetch(`/api/shipments/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        const res = await fetch('/api/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await res.json();
        shpId = d.data?.id || null;
      }
      setSavedId(shpId);
      // 대기 중인 파일이 있으면 저장 직후 업로드
      if (shpId && pendingFiles.length > 0) {
        await uploadDocuments(pendingFiles, shpId);
        setPendingFiles([]);
      }
      onSave();
    } finally { setSaving(false); }
  };

  const DOC_TYPE_LABEL: Record<ShipDocType, string> = {
    invoice: 'Invoice', packing_list: 'Packing List', bl: 'B/L', combined: 'Invoice+PL', co: 'C/O', other: '기타',
  };
  const DOC_TYPE_COLOR: Record<ShipDocType, string> = {
    invoice: 'bg-purple-100 text-purple-700', packing_list: 'bg-green-100 text-green-700',
    bl: 'bg-blue-100 text-blue-700', combined: 'bg-amber-100 text-amber-700',
    co: 'bg-teal-100 text-teal-700', other: 'bg-gray-100 text-gray-600',
  };

  const uploadDocuments = async (files: FileList | File[], shpIdOverride?: string) => {
    const shpId = shpIdOverride || savedId || item?.id;
    if (!shpId) {
      setDocMsg({ text: '선적을 먼저 저장한 후 서류를 업로드하세요', ok: false });
      return;
    }
    setDocUploading(true);
    setDocMsg(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('files', f));
      const res = await fetch(`/api/shipments/${shpId}/documents`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      setDocuments(prev => [...prev, ...d.data]);
      const detected = (d.data as ShipDocument[]).map(doc => DOC_TYPE_LABEL[doc.docType]).join(', ');
      setDocMsg({ text: `${d.data.length}개 업로드 완료 — 분류: ${detected}`, ok: true });

      // If packing list detected, ask to extract cargo items
      const hasPL = (d.data as ShipDocument[]).some(doc => doc.docType === 'packing_list' || doc.docType === 'combined');
      if (hasPL && form.cargoItems.every(i => !i.productName)) {
        const plFile = (d.data as ShipDocument[]).find(doc => doc.docType === 'packing_list' || doc.docType === 'combined');
        if (plFile) {
          const origFile = Array.from(files).find(f => f.name === plFile.originalName);
          if (origFile) await uploadPackingList(origFile);
        }
      }
    } catch (e) {
      setDocMsg({ text: `업로드 실패: ${e}`, ok: false });
    } finally {
      setDocUploading(false);
    }
  };

  const deleteDoc = async (docId: string) => {
    const shpId = savedId || item?.id;
    if (!shpId) return;
    await fetch(`/api/shipments/${shpId}/documents?docId=${docId}`, { method: 'DELETE' });
    setDocuments(prev => prev.filter(d => d.id !== docId));
  };

  const changeDocType = async (doc: ShipDocument, newType: ShipDocType) => {
    // 로컬 상태 즉시 업데이트
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, docType: newType } : d));
    // 저장된 선적이 있으면 즉시 API 반영
    const shpId = savedId || item?.id;
    if (shpId) {
      await fetch(`/api/shipments/${shpId}/documents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: doc.id, docType: newType }),
      }).catch(e => console.error('[changeDocType]', e));
    }
  };

  const changeDocCustomName = async (doc: ShipDocument, name: string) => {
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, customName: name } : d));
    const shpId = savedId || item?.id;
    if (shpId) {
      await fetch(`/api/shipments/${shpId}/documents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: doc.id, docType: doc.docType, customName: name }),
      }).catch(e => console.error('[changeDocCustomName]', e));
    }
  };

  const inputCls = 'w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
  const labelCls = 'text-xs font-medium text-muted-foreground mb-1 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[96vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b sticky top-0 bg-background z-10">
          <h2 className="font-semibold text-base">{item ? '선적 수정' : '선적 등록'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }} className="p-5 space-y-5">
          {/* ─── Row 1: Type / Status / Forwarder */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>운송유형</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                <option>LCL</option><option>FCL</option><option>AIR</option><option>COURIER</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>포워더</label>
              <input
                list="forwarder-list"
                value={form.forwarderName}
                onChange={e => setForm(f => ({ ...f, forwarderName: e.target.value }))}
                placeholder="포워더 검색..."
                className={inputCls}
              />
              <datalist id="forwarder-list">
                {forwarders.map(fw => <option key={fw.id} value={fw.name} />)}
              </datalist>
            </div>
          </div>

          {/* ─── B/L Section */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ship className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">B/L 정보</span>
                <span className="text-xs text-blue-500 hidden sm:inline">— B/L 번호 입력 후 조회하면 캐리어 감지 및 정보 자동 완성</span>
              </div>
              <label className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs border border-dashed border-blue-300 rounded-lg cursor-pointer transition-colors',
                blPdfUploading ? 'bg-blue-50 text-blue-300' : 'hover:bg-blue-50 text-blue-600',
              )}>
                <input
                  ref={blPdfRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  disabled={blPdfUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadBlPdf(f); e.target.value = ''; }}
                />
                {blPdfUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                B/L PDF 업로드
              </label>
            </div>
            {blPdfMsg && (
              <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs', blPdfMsg.ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                {blPdfMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                {blPdfMsg.text}
              </div>
            )}

            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>B/L 번호 조회 및 PDF 업로드는 <strong>보조 도구</strong>입니다. 자동 완성된 내용은 반드시 실제 서류와 대조 후 확인하세요. 직접 입력이 우선입니다.</span>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className={labelCls}>B/L No</label>
                <Input
                  value={form.blNo}
                  onChange={e => { setForm(f => ({ ...f, blNo: e.target.value })); setBlLookup(null); }}
                  placeholder="HJKU2026083501"
                  onBlur={lookupBL}
                />
              </div>
              <div className="flex-[1.2]">
                <label className={labelCls}>컨테이너 번호</label>
                <Input value={form.containerNo} onChange={e => setForm(f => ({ ...f, containerNo: e.target.value }))} placeholder="TCKU1234567" />
              </div>
              <div className="w-28">
                <label className={labelCls}>컨테이너 종류</label>
                <input
                  list="cntr-type-list"
                  value={form.containerType}
                  onChange={e => setForm(f => ({ ...f, containerType: e.target.value }))}
                  placeholder="40HQ"
                  className={inputCls}
                />
                <datalist id="cntr-type-list">
                  {CONTAINER_TYPES.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div className="flex items-end pb-0.5">
                <Button type="button" variant="outline" size="sm" onClick={lookupBL} disabled={blLoading || !form.blNo} className="h-9 gap-1.5">
                  {blLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  조회
                </Button>
              </div>
            </div>

            {blLookup && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-blue-700 flex-wrap">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <BlLookupBadge carrierName={blLookup.carrierName} trackingUrl={blLookup.trackingUrl} />
                  {blLookup.source === 'unipass' && <span className="text-green-700 font-medium">✓ 관세청 유니패스 자동 완성</span>}
                  {blLookup.source === 'ship24' && <span className="text-green-600 font-medium">✓ Ship24 자동 완성</span>}
                  {blLookup.source === 'searates' && <span className="text-blue-500">✓ Searates 자동 완성</span>}
                  {(blLookup as any).unipassMissing && (
                    <span className="text-amber-600">관세청 유니패스 API 키 미설정 — 설정에서 무료 등록 가능</span>
                  )}
                  {blLookup.trackingUrl && !blLookup.source && (
                    <span className="text-blue-400">캐리어 추적 링크 ↗ 를 클릭해 직접 확인하세요</span>
                  )}
                </div>
                {blLookup.events && blLookup.events.length > 0 && (
                  <div className="bg-white border border-blue-100 rounded-lg p-2 max-h-28 overflow-y-auto">
                    <p className="text-xs font-medium text-blue-600 mb-1.5">최근 운송 이력</p>
                    {blLookup.events.map((ev, i) => (
                      <div key={i} className="flex gap-2 text-xs text-gray-600 mb-1">
                        <span className="text-gray-400 shrink-0">{ev.date ? String(ev.date).slice(0, 10) : ''}</span>
                        <span className="font-medium shrink-0">{ev.location}</span>
                        <span className="truncate">{ev.desc}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>출발항 (POL) *</label>
                <input list="pol-ports" value={form.pol} onChange={e => setForm(f => ({ ...f, pol: e.target.value }))} placeholder="CNNGB" required className={inputCls} />
                <datalist id="pol-ports">{COMMON_PORTS.map(p => <option key={p} value={p} />)}</datalist>
              </div>
              <div>
                <label className={labelCls}>도착항 (POD) *</label>
                <input list="pod-ports" value={form.pod} onChange={e => setForm(f => ({ ...f, pod: e.target.value }))} placeholder="KRPUS" required className={inputCls} />
                <datalist id="pod-ports">{COMMON_PORTS.map(p => <option key={p} value={p} />)}</datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>선박명</label>
                <Input value={form.vessel} onChange={e => setForm(f => ({ ...f, vessel: e.target.value }))} placeholder="EVER GLORY" />
              </div>
              <div>
                <label className={labelCls}>항차 (Voyage)</label>
                <Input value={form.voyage} onChange={e => setForm(f => ({ ...f, voyage: e.target.value }))} placeholder="202W34" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>ETD (출발일)</label>
                <Input type="date" value={form.etd} onChange={e => setForm(f => ({ ...f, etd: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>ETA (도착예정일)</label>
                <Input type="date" value={form.eta} onChange={e => setForm(f => ({ ...f, eta: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* ─── Cargo Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">화물 품목</span>
                <span className="text-xs text-muted-foreground">혼적 시 공급사/PO별로 추가</span>
              </div>
              <div className="flex items-center gap-2">
                <label className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed rounded-lg cursor-pointer transition-colors',
                  plUploading ? 'bg-gray-100 text-gray-400' : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                )}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    disabled={plUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadPackingList(f); e.target.value = ''; }}
                  />
                  {plUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  패킹리스트 엑셀 업로드
                </label>
                <Button type="button" variant="outline" size="sm" onClick={addCargoItem} className="h-7 gap-1 text-xs">
                  <PlusIcon className="w-3.5 h-3.5" /> 품목 추가
                </Button>
              </div>
            </div>

            {plMsg && (
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-xs', plMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
                {plMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                {plMsg.text}
              </div>
            )}

            {/* 시트 선택 UI */}
            {plSheets.length > 1 && plPendingFile && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                <span className="text-blue-700 font-medium shrink-0">시트 선택:</span>
                {plSheets.map(s => (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => uploadPackingList(plPendingFile, s.index)}
                    className="px-2 py-0.5 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-100 font-medium"
                  >
                    {s.index + 1}. {s.name}
                  </button>
                ))}
              </div>
            )}

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[18%]">제품명 *</th>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[12%]">공급사</th>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[9%]">PO 번호</th>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[10%]">
                      <span>내부 PO</span>
                      <span className="ml-1 text-[10px] text-blue-500 font-normal">DB 연결</span>
                    </th>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[10%]">
                      <span>내부 PI</span>
                      <span className="ml-1 text-[10px] text-blue-500 font-normal">DB 연결</span>
                    </th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-medium w-[6%]">수량</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-medium w-[9%]">중량(kg)</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-medium w-[7%]">CBM</th>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[10%]">비고</th>
                    <th className="px-2 py-2 w-[4%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {form.cargoItems.map((ci, idx) => (
                    <tr key={ci.id}>
                      <td className="px-1 py-1">
                        <input
                          className="w-full px-2 py-1 border border-input rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="제품명"
                          value={ci.productName}
                          onChange={e => updateCargoItem(idx, { productName: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          list={`supplier-list-${idx}`}
                          className="w-full px-2 py-1 border border-input rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="공급사 검색..."
                          value={ci.supplierName || ''}
                          onChange={e => {
                            updateCargoItem(idx, { supplierName: e.target.value });
                            loadPOsForSupplier(e.target.value);
                          }}
                          onBlur={e => loadPOsForSupplier(e.target.value)}
                        />
                        <datalist id={`supplier-list-${idx}`}>
                          {suppliers.map(s => <option key={s.id} value={s.name} />)}
                        </datalist>
                      </td>
                      <td className="px-1 py-1">
                        <input
                          className="w-full px-2 py-1 border border-input rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="PO 번호"
                          value={ci.poBusinessId || ''}
                          onChange={e => updateCargoItem(idx, { poBusinessId: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          list={`po-list-${idx}`}
                          className={`w-full px-2 py-1 border rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring ${ci.linkedPoBusinessId ? 'border-blue-400 bg-blue-50' : 'border-input'}`}
                          placeholder="내부 PO 선택..."
                          value={ci.linkedPoBusinessId || ''}
                          onChange={e => handleLinkedPoSelect(idx, ci.supplierName || '', e.target.value)}
                          onBlur={e => handleLinkedPoSelect(idx, ci.supplierName || '', e.target.value)}
                          onFocus={() => loadPOsForSupplier(ci.supplierName || '')}
                        />
                        <datalist id={`po-list-${idx}`}>
                          {(posBySupplier[ci.supplierName || ''] || []).map(p => (
                            <option key={p.id} value={p.businessId}>{p.businessId} — {p.supplierName}</option>
                          ))}
                        </datalist>
                      </td>
                      <td className="px-1 py-1">
                        <input
                          list={`pi-list-${idx}`}
                          className={`w-full px-2 py-1 border rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring ${ci.linkedPiNumber ? 'border-blue-400 bg-blue-50' : 'border-input'}`}
                          placeholder="내부 PI 선택..."
                          value={ci.linkedPiNumber || ''}
                          onChange={e => handleLinkedPiSelect(idx, ci.supplierName || '', e.target.value)}
                          onBlur={e => handleLinkedPiSelect(idx, ci.supplierName || '', e.target.value)}
                          onFocus={() => loadPOsForSupplier(ci.supplierName || '')}
                        />
                        <datalist id={`pi-list-${idx}`}>
                          {(posBySupplier[ci.supplierName || ''] || []).filter(p => p.piNumber).map(p => (
                            <option key={p.id} value={p.piNumber}>{p.piNumber} — {p.businessId}</option>
                          ))}
                        </datalist>
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          className="w-full px-2 py-1 border border-input rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring text-right"
                          placeholder="0"
                          value={ci.qty ?? ''}
                          onChange={e => updateCargoItem(idx, { qty: e.target.value ? Number(e.target.value) : undefined })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          className="w-full px-2 py-1 border border-input rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring text-right"
                          placeholder="0"
                          value={ci.grossWeight ?? ''}
                          onChange={e => updateCargoItem(idx, { grossWeight: e.target.value ? Number(e.target.value) : undefined })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          step="0.001"
                          className="w-full px-2 py-1 border border-input rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring text-right"
                          placeholder="0"
                          value={ci.cbm ?? ''}
                          onChange={e => updateCargoItem(idx, { cbm: e.target.value ? Number(e.target.value) : undefined })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          className="w-full px-2 py-1 border border-input rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="비고"
                          value={ci.remark || ''}
                          onChange={e => updateCargoItem(idx, { remark: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        {form.cargoItems.length > 1 && (
                          <button type="button" onClick={() => removeCargoItem(idx)} className="text-red-400 hover:text-red-600 p-1">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {form.cargoItems.length > 1 && (
                  <tfoot className="bg-muted/30 border-t border-border">
                    <tr>
                      <td colSpan={5} className="px-2 py-1.5 text-xs text-muted-foreground font-medium text-right">합계</td>
                      <td className="px-2 py-1.5 text-xs font-semibold text-right">{totalGW > 0 ? `${totalGW.toLocaleString()}kg` : '-'}</td>
                      <td className="px-2 py-1.5 text-xs font-semibold text-right">{totalCBM > 0 ? totalCBM.toFixed(3) : '-'}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* ─── PO Preview Panel */}
          {poPreview && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-800">발주서 확인 — {poPreview.businessId}</span>
                <button type="button" onClick={() => setPoPreview(null)} className="text-blue-400 hover:text-blue-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-blue-700">
                <span>공급사: <b>{poPreview.supplierName}</b></span>
                <span>발주일: {poPreview.orderDate}</span>
                {poPreview.etd && <span>ETD: {poPreview.etd}</span>}
                <span>통화: {poPreview.currency}</span>
                {poPreview.incoterm && <span>Incoterm: {poPreview.incoterm}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-blue-100 text-blue-800">
                      <th className="px-2 py-1 text-left font-medium border border-blue-200">제품명</th>
                      <th className="px-2 py-1 text-right font-medium border border-blue-200 w-16">수량</th>
                      <th className="px-2 py-1 text-right font-medium border border-blue-200 w-20">단가</th>
                      <th className="px-2 py-1 text-right font-medium border border-blue-200 w-24">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poPreview.items.map((item, i) => (
                      <tr key={i} className="border-b border-blue-100">
                        <td className="px-2 py-1 border border-blue-200">{item.productName}</td>
                        <td className="px-2 py-1 text-right border border-blue-200">{item.qty?.toLocaleString()}</td>
                        <td className="px-2 py-1 text-right border border-blue-200">{item.unitPrice?.toLocaleString()}</td>
                        <td className="px-2 py-1 text-right border border-blue-200">{item.amount?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-100 font-semibold text-blue-800">
                      <td colSpan={3} className="px-2 py-1 text-right border border-blue-200">합계</td>
                      <td className="px-2 py-1 text-right border border-blue-200">{poPreview.currency} {poPreview.totalAmount?.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ─── Documents */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">첨부 서류</span>
                <span className="text-xs text-muted-foreground">B/L · Invoice · Packing List (단일 파일 또는 복합 파일 모두 가능)</span>
              </div>
              <label className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed rounded-lg cursor-pointer transition-colors',
                docUploading ? 'bg-gray-100 text-gray-400' : 'hover:bg-muted text-muted-foreground hover:text-foreground',
              )}>
                <input
                  ref={docFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.doc,.docx"
                  className="hidden"
                  disabled={docUploading}
                  onChange={e => {
                    if (!e.target.files?.length) return;
                    const shpId = savedId || item?.id;
                    if (shpId) {
                      uploadDocuments(e.target.files);
                    } else {
                      setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                      setDocMsg({ text: `${e.target.files.length}개 파일 선택됨 — 저장 시 자동 업로드됩니다`, ok: true });
                    }
                    e.target.value = '';
                  }}
                />
                {docUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                서류 업로드 (여러 파일 가능)
              </label>
            </div>

            {docMsg && (
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-xs', docMsg.ok ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                {docMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                {docMsg.text}
              </div>
            )}

            {pendingFiles.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-blue-600 font-medium px-1">저장 시 함께 업로드 ({pendingFiles.length}개)</div>
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                    {f.name.endsWith('.pdf')
                      ? <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      : <File className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                    <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {documents.length > 0 && (
              <div className="space-y-1.5">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg border border-border">
                    {doc.originalName.endsWith('.pdf')
                      ? <FileText className="w-4 h-4 text-red-500 shrink-0" />
                      : <File className="w-4 h-4 text-green-600 shrink-0" />}
                    <span className="text-xs text-gray-500 shrink-0 max-w-[120px] truncate" title={doc.originalName}>{doc.originalName}</span>
                    <select
                      value={doc.docType}
                      onChange={e => changeDocType(doc, e.target.value as ShipDocType)}
                      className="text-xs border border-input rounded px-1.5 py-0.5 bg-background shrink-0"
                    >
                      <option value="invoice">Invoice</option>
                      <option value="packing_list">Packing List</option>
                      <option value="bl">B/L</option>
                      <option value="combined">Invoice+PL</option>
                      <option value="co">C/O (원산지증명)</option>
                      <option value="other">기타</option>
                    </select>
                    {doc.docType === 'other' && (
                      <input
                        className="text-xs border border-input rounded px-1.5 py-0.5 bg-background w-28"
                        placeholder="서류명 입력"
                        value={doc.customName || ''}
                        onChange={e => changeDocCustomName(doc, e.target.value)}
                      />
                    )}
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', DOC_TYPE_COLOR[doc.docType])}>
                      {doc.docType === 'other' && doc.customName ? doc.customName : DOC_TYPE_LABEL[doc.docType]}
                    </span>
                    <button type="button" onClick={() => openAppUrl(doc.url)} className="text-blue-500 hover:text-blue-700">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => deleteDoc(doc.id)} className="text-red-400 hover:text-red-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Freight / Totals */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>총 CBM {totalCBM > 0 && <span className="text-blue-500 font-normal ml-1">자동 계산: {totalCBM.toFixed(3)}</span>}</label>
              <Input type="number" step="0.001" value={form.cbm} onChange={e => setForm(f => ({ ...f, cbm: e.target.value }))} placeholder={totalCBM ? String(totalCBM.toFixed(3)) : '0'} />
            </div>
            <div>
              <label className={labelCls}>총 중량(kg) {totalGW > 0 && <span className="text-blue-500 font-normal ml-1">자동: {totalGW.toLocaleString()}</span>}</label>
              <Input type="number" value={form.grossWeight} onChange={e => setForm(f => ({ ...f, grossWeight: e.target.value }))} placeholder={totalGW ? String(totalGW) : '0'} />
            </div>
            <div>
              <label className={labelCls}>운임</label>
              <Input type="number" value={form.freightCost} onChange={e => setForm(f => ({ ...f, freightCost: e.target.value }))} placeholder="1200" />
            </div>
            <div>
              <label className={labelCls}>통화</label>
              <select value={form.freightCurrency} onChange={e => setForm(f => ({ ...f, freightCurrency: e.target.value }))} className={inputCls}>
                <option>USD</option><option>KRW</option><option>EUR</option><option>CNY</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {item ? '수정' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ShipmentsPageInner() {
  const searchParams = useSearchParams();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item?: Shipment | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/shipments').then(r => r.json());
    if (res.data) setShipments(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || loading) return;
    const found = shipments.find(s => s.businessId === openId);
    if (found) setModal({ open: true, item: found });
  }, [loading, shipments, searchParams]);

  const handleDelete = async (id: string) => {
    if (!confirm('선적을 삭제하시겠습니까?')) return;
    await fetch(`/api/shipments/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = shipments.filter(s =>
    s.businessId.toLowerCase().includes(search.toLowerCase()) ||
    (s.blNo ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.vessel ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.forwarderName ?? '').toLowerCase().includes(search.toLowerCase()) ||
    s.cargoItems?.some(i => i.productName.toLowerCase().includes(search.toLowerCase()) || (i.supplierName ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="선적" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="선적번호, B/L, 선박명, 제품명 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">선적 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {['선적번호', '유형', '포워더', '경로', '선박/항차', 'B/L No', 'ETD', 'ETA', '화물', '상태', '관리'].map(h => (
                      <th key={h} className={cn('px-3 py-2.5 text-xs font-medium text-muted-foreground', h === '관리' ? 'text-right' : 'text-left')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(s => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3 font-mono text-xs font-medium">{s.businessId}</td>
                      <td className="px-3 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', TYPE_STYLE[s.type])}>{s.type}</span></td>
                      <td className="px-3 py-3 text-xs text-muted-foreground max-w-[100px] truncate">{s.forwarderName ?? '-'}</td>
                      <td className="px-3 py-3 text-xs">{s.pol ?? '-'} → {s.pod ?? '-'}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{s.vessel ? `${s.vessel} / ${s.voyage ?? ''}` : '-'}</td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{s.blNo ?? '-'}</td>
                      <td className="px-3 py-3 text-xs">{s.etd ?? '-'}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{s.eta ?? '-'}</td>
                      <td className="px-3 py-3 text-xs">
                        {s.cargoItems?.length > 0 ? (
                          <div className="space-y-0.5">
                            {s.cargoItems.slice(0, 2).map(ci => (
                              <div key={ci.id} className="text-muted-foreground truncate max-w-[140px]">
                                {ci.productName}{ci.supplierName ? ` (${ci.supplierName})` : ''}
                              </div>
                            ))}
                            {s.cargoItems.length > 2 && <div className="text-blue-500">+{s.cargoItems.length - 2}개 더</div>}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_STYLE[s.status])}>{STATUS_LABEL[s.status]}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: s })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Ship className="w-8 h-8 mx-auto mb-2 opacity-30" />선적 내역이 없습니다.
                </div>
              )}
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map(s => (
                <div key={s.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{s.businessId}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', TYPE_STYLE[s.type])}>{s.type}</span>
                        <span className="text-sm font-semibold">{s.pol} → {s.pod}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', STATUS_STYLE[s.status])}>{STATUS_LABEL[s.status]}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: s })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  {s.vessel && <p className="text-xs text-muted-foreground mb-1">🚢 {s.vessel} {s.voyage}</p>}
                  {s.blNo && <p className="text-xs text-muted-foreground font-mono mb-1">B/L: {s.blNo}</p>}
                  {s.cargoItems?.length > 0 && (
                    <div className="text-xs text-muted-foreground mb-2">
                      {s.cargoItems.map(ci => <span key={ci.id} className="mr-2">{ci.productName}</span>)}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">ETD</p><p className="font-semibold">{s.etd ?? '-'}</p></div>
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">ETA</p><p className="font-semibold">{s.eta ?? '-'}</p></div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">선적 내역이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
      {modal.open && (
        <ShipmentModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}

import { Suspense as _S } from 'react';
export default function ShipmentsPage() { return <_S><ShipmentsPageInner /></_S>; }
