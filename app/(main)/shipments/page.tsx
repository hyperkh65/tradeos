'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Ship, Plus, Search, X, Loader2, Pencil, Trash2, Upload,
  ExternalLink, RefreshCw, Plus as PlusIcon, Minus, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Shipment, CargoItem } from '@/types';

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

interface ShipForm {
  type: string; status: string;
  forwarderName: string;
  pol: string; pod: string;
  etd: string; eta: string;
  vessel: string; voyage: string;
  blNo: string; containerNo: string;
  cbm: string; grossWeight: string;
  freightCost: string; freightCurrency: string;
  cargoItems: CargoItem[];
}

function ShipmentModal({
  item, onClose, onSave,
}: { item?: Shipment | null; onClose: () => void; onSave: () => void }) {
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
    cbm: item?.cbm?.toString() || '',
    grossWeight: item?.grossWeight?.toString() || '',
    freightCost: item?.freightCost?.toString() || '',
    freightCurrency: item?.freightCurrency || 'USD',
    cargoItems: item?.cargoItems?.length ? item.cargoItems : [newCargoItem()],
  });

  const [saving, setSaving] = useState(false);
  const [blLookup, setBlLookup] = useState<{ carrierName?: string | null; trackingUrl?: string | null; source?: string } | null>(null);
  const [blLoading, setBlLoading] = useState(false);
  const [plUploading, setPlUploading] = useState(false);
  const [plMsg, setPlMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      setBlLookup({ carrierName: d.carrierName, trackingUrl: d.trackingUrl, source: d.source });
      // Auto-fill if tracking API returned data
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

  const uploadPackingList = async (file: File) => {
    setPlUploading(true);
    setPlMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/shipments/parse-packing-list', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      if (d.items?.length > 0) {
        setForm(f => ({
          ...f,
          cargoItems: d.items,
          grossWeight: d.totalGrossWeight ? String(d.totalGrossWeight) : f.grossWeight,
          cbm: d.totalCbm ? String(d.totalCbm) : f.cbm,
        }));
        setPlMsg({ text: `${d.items.length}개 품목 추출 완료 (총 ${d.totalGrossWeight}kg, ${d.totalCbm}CBM)`, ok: true });
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
      };
      if (item) {
        await fetch(`/api/shipments/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      onSave();
    } finally { setSaving(false); }
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

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
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
              <Input value={form.forwarderName} onChange={e => setForm(f => ({ ...f, forwarderName: e.target.value }))} placeholder="한진해운포워딩" />
            </div>
          </div>

          {/* ─── B/L Section */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Ship className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">B/L 정보</span>
              <span className="text-xs text-blue-500">— B/L 번호 입력 후 조회하면 캐리어 감지 및 정보 자동 완성</span>
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
              <div className="flex-1">
                <label className={labelCls}>컨테이너 번호</label>
                <Input value={form.containerNo} onChange={e => setForm(f => ({ ...f, containerNo: e.target.value }))} placeholder="TCKU1234567" />
              </div>
              <div className="flex items-end pb-0.5">
                <Button type="button" variant="outline" size="sm" onClick={lookupBL} disabled={blLoading || !form.blNo} className="h-9 gap-1.5">
                  {blLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  조회
                </Button>
              </div>
            </div>

            {blLookup && (
              <div className="flex items-center gap-2 text-xs text-blue-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <BlLookupBadge carrierName={blLookup.carrierName} trackingUrl={blLookup.trackingUrl} />
                {blLookup.trackingUrl && <span className="text-blue-500">위 링크에서 확인 후 아래 정보를 입력/수정하세요</span>}
                {blLookup.source && <span className="text-green-600 ml-1">✓ 자동 완성됨</span>}
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

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[25%]">제품명 *</th>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[18%]">공급사</th>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[15%]">PO 번호</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-medium w-[8%]">수량</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-medium w-[10%]">중량(kg)</th>
                    <th className="px-2 py-2 text-right text-muted-foreground font-medium w-[8%]">CBM</th>
                    <th className="px-2 py-2 text-left text-muted-foreground font-medium w-[12%]">비고</th>
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
                          className="w-full px-2 py-1 border border-input rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="공급사"
                          value={ci.supplierName || ''}
                          onChange={e => updateCargoItem(idx, { supplierName: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          className="w-full px-2 py-1 border border-input rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="PO-2026-0001"
                          value={ci.poBusinessId || ''}
                          onChange={e => updateCargoItem(idx, { poBusinessId: e.target.value })}
                        />
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
                      <td colSpan={4} className="px-2 py-1.5 text-xs text-muted-foreground font-medium text-right">합계</td>
                      <td className="px-2 py-1.5 text-xs font-semibold text-right">{totalGW > 0 ? `${totalGW.toLocaleString()}kg` : '-'}</td>
                      <td className="px-2 py-1.5 text-xs font-semibold text-right">{totalCBM > 0 ? totalCBM.toFixed(3) : '-'}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
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

export default function ShipmentsPage() {
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

  const handleDelete = async (id: string) => {
    if (!confirm('선적을 삭제하시겠습니까?')) return;
    await fetch(`/api/shipments/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = shipments.filter(s =>
    s.businessId.includes(search) ||
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
