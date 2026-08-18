'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Plus, Trash2, Upload, Copy, FileSpreadsheet, X, Check,
  Printer, ChevronDown, ChevronRight, Paperclip, FileDown, Save,
} from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface ItemCert {
  id: string; name: string;
  totalCostKrw: number;  // 총 인증비 (원)
  shipQty: number;       // 회수 물량 (개)
}
interface EstimatorItem {
  id: string; name: string;
  currency: 'USD' | 'CNY';
  sellingCurrency?: 'USD' | 'CNY' | 'KRW';
  fobPrice: number;
  boxL: number; boxW: number; boxH: number;
  qtyPerBox: number;
  weightG?: number;       // 무게(g) — EPR 계산에도 사용
  certs?: ItemCert[];     // 제품별 인증비
  dutyRateOverride?: number;
  sellingPrice?: number;
  targetMargin?: number;
  mixedCbm?: number;
  note?: string;
}
interface EstimatorCase {
  id: string; name: string;
  containerType: '20ft' | '40ft' | '40HQ';
  freightSeaUsd?: number;
  freightSea: number; freightInland: number; freightPort: number; freightMisc: number;
  fxUsd: number;      // 구매·비용 USD/KRW
  fxUsdSell: number;  // 판매·견적 USD/KRW
  fxRmb: number;      // 구매·비용 RMB/KRW
  fxRmbSell: number;  // 판매·견적 RMB/KRW
  dutyRate: number;
  eprRate: number;
  simMode: 'standard' | 'reverse' | 'mixed';
  items: EstimatorItem[];
  notes?: string;
  createdAt: string; updatedAt: string;
}
interface Attachment {
  id: string; name: string; filename: string; size: number; uploadedAt: string;
}

// ── 상수 ──────────────────────────────────────────────────────────────────────
const CONTAINER_CBM: Record<string, number> = { '20ft': 27, '40ft': 56, '40HQ': 68 };
const CERT_PRESETS = ['EMC', 'KC인증', '효율등급', '안전확인', 'CE', 'RoHS', 'ERP인증'];

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function getSeaKrw(c: EstimatorCase) {
  return c.freightSeaUsd != null
    ? Math.round(c.freightSeaUsd * (c.fxUsd || 1430))
    : (c.freightSea || 0);
}
function getSeaUsd(c: EstimatorCase) {
  return c.freightSeaUsd != null ? c.freightSeaUsd
    : Math.round((c.freightSea || 0) / (c.fxUsd || 1430));
}

// ── 계산 함수 ──────────────────────────────────────────────────────────────────
function calcItem(item: EstimatorItem, c: EstimatorCase) {
  const fxUsd = c.fxUsd || 1430;
  const fxUsdSell = c.fxUsdSell || fxUsd;
  const fxRmb = c.fxRmb || 195;
  const fxRmbSell = c.fxRmbSell || fxRmb;
  const containerCbm = CONTAINER_CBM[c.containerType] || 56;

  const fobUsd = item.currency === 'CNY' ? item.fobPrice * (fxRmb / fxUsd) : item.fobPrice;
  const cbmPerBox = item.boxL > 0 && item.boxW > 0 && item.boxH > 0
    ? (item.boxL * item.boxW * item.boxH) / 1_000_000_000 : 0;

  let qtyPerContainer = 0;
  if (c.simMode === 'mixed' && item.mixedCbm && item.mixedCbm > 0) {
    qtyPerContainer = cbmPerBox > 0 ? Math.floor(item.mixedCbm / cbmPerBox) * item.qtyPerBox : 0;
  } else {
    qtyPerContainer = cbmPerBox > 0 ? Math.floor(containerCbm / cbmPerBox) * item.qtyPerBox : 0;
  }

  const freightSeaKrw = getSeaKrw(c);
  const otherFreightKrw = (c.freightInland || 0) + (c.freightPort || 0) + (c.freightMisc || 0);
  const seaPerUnitUsd = qtyPerContainer > 0 ? freightSeaKrw / qtyPerContainer / fxUsd : 0;
  const otherPerUnitKrw = qtyPerContainer > 0 ? otherFreightKrw / qtyPerContainer : 0;
  const totalFreightPerUnitUsd = qtyPerContainer > 0
    ? (freightSeaKrw + otherFreightKrw) / qtyPerContainer / fxUsd : 0;

  const cifUsd = fobUsd + seaPerUnitUsd;
  const dutyRate = item.dutyRateOverride ?? c.dutyRate;
  const dutyPerUnitUsd = cifUsd * dutyRate;

  const eprPerUnitKrw = ((item.weightG || 0) / 1000) * (c.eprRate || 0);
  const certPerUnitKrw = (item.certs || []).reduce((sum, cert) =>
    sum + (cert.shipQty > 0 ? cert.totalCostKrw / cert.shipQty : 0), 0);

  const ddpKrw = (cifUsd + dutyPerUnitUsd) * fxUsd + otherPerUnitKrw + eprPerUnitKrw + certPerUnitKrw;
  const ddpUsd = ddpKrw / fxUsd;
  const ddpRmb = ddpKrw / fxRmb;

  // 판매가 → 통화별 계산
  let sellingUsd: number | undefined;
  let sellingKrw: number | undefined;
  let sellingRmb: number | undefined;

  if (c.simMode === 'reverse' && item.targetMargin !== undefined) {
    const m = Math.min(Math.max(item.targetMargin, 0), 0.99);
    // 판매통화에 따라 역산
    const sc = item.sellingCurrency || 'USD';
    if (sc === 'CNY') {
      sellingKrw = ddpKrw / (1 - m);
      sellingRmb = sellingKrw / fxRmbSell;
      sellingUsd = sellingKrw / fxUsdSell;
    } else if (sc === 'KRW') {
      sellingKrw = ddpKrw / (1 - m);
      sellingUsd = sellingKrw / fxUsdSell;
      sellingRmb = sellingKrw / fxRmbSell;
    } else {
      sellingUsd = ddpUsd / (1 - m);
      sellingKrw = sellingUsd * fxUsdSell;
      sellingRmb = sellingKrw / fxRmbSell;
    }
  } else if (item.sellingPrice && item.sellingPrice > 0) {
    const sc = item.sellingCurrency || 'USD';
    if (sc === 'USD') {
      sellingUsd = item.sellingPrice;
      sellingKrw = sellingUsd * fxUsdSell;
      sellingRmb = sellingKrw / fxRmbSell;
    } else if (sc === 'CNY') {
      sellingRmb = item.sellingPrice;
      sellingKrw = sellingRmb * fxRmbSell;
      sellingUsd = sellingKrw / fxUsdSell;
    } else {
      sellingKrw = item.sellingPrice;
      sellingUsd = sellingKrw / fxUsdSell;
      sellingRmb = sellingKrw / fxRmbSell;
    }
  }

  const profitKrw = sellingKrw !== undefined ? sellingKrw - ddpKrw : undefined;
  const marginKrw = sellingKrw && sellingKrw > 0 && profitKrw !== undefined ? profitKrw / sellingKrw : undefined;
  const freightRatio = sellingUsd && sellingUsd > 0 ? totalFreightPerUnitUsd / sellingUsd : undefined;

  return {
    fobUsd, cbmPerBox, qtyPerContainer,
    seaPerUnitUsd, otherPerUnitKrw, totalFreightPerUnitUsd,
    cifUsd, dutyPerUnitUsd, dutyRate,
    eprPerUnitKrw, certPerUnitKrw,
    ddpUsd, ddpKrw, ddpRmb,
    sellingUsd, sellingKrw, sellingRmb,
    profitKrw, marginKrw, freightRatio,
  };
}

function fmtUsd(n?: number) {
  if (n === undefined || isNaN(n) || !isFinite(n)) return '-';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRmb(n?: number) {
  if (n === undefined || isNaN(n) || !isFinite(n)) return '-';
  return '¥' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtKrw(n?: number) {
  if (n === undefined || isNaN(n) || !isFinite(n)) return '-';
  return Math.round(n).toLocaleString() + '원';
}
function fmtPct(n?: number) {
  if (n === undefined || isNaN(n) || !isFinite(n)) return '-';
  return (n * 100).toFixed(1) + '%';
}
function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

const newItem = (): EstimatorItem => ({
  id: Math.random().toString(36).slice(2),
  name: '', currency: 'USD', fobPrice: 0,
  boxL: 0, boxW: 0, boxH: 0, qtyPerBox: 1,
});

// ── 인증비 팝업 에디터 ─────────────────────────────────────────────────────────
function CertEditorPopup({ certs, onChange, onClose }: {
  certs: ItemCert[]; onChange: (c: ItemCert[]) => void; onClose: () => void;
}) {
  const [customName, setCustomName] = useState('');
  const addCert = (name: string) => {
    if (!name.trim()) return;
    onChange([...certs, { id: Math.random().toString(36).slice(2), name: name.trim(), totalCostKrw: 0, shipQty: 5000 }]);
    setCustomName('');
  };
  const upd = (i: number, p: Partial<ItemCert>) => onChange(certs.map((c, j) => j === i ? { ...c, ...p } : c));
  const del = (i: number) => onChange(certs.filter((_, j) => j !== i));
  const totalPerUnit = certs.reduce((s, c) => s + (c.shipQty > 0 ? c.totalCostKrw / c.shipQty : 0), 0);
  const available = CERT_PRESETS.filter(p => !certs.find(c => c.name === p));

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute z-30 top-8 left-0 bg-background border rounded-xl shadow-2xl p-3 w-72">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold">인증비 설정</span>
          <button onClick={onClose}><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {certs.map((cert, i) => (
            <div key={cert.id} className="bg-orange-50/60 border border-orange-200/50 rounded-lg p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-orange-900">{cert.name}</span>
                <button onClick={() => del(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground w-12">총비용</span>
                <input type="number" step="100000" value={cert.totalCostKrw || ''}
                  placeholder="0" onChange={e => upd(i, { totalCostKrw: parseInt(e.target.value) || 0 })}
                  className="h-5 border rounded text-[10px] px-1 flex-1 text-right" />
                <span className="text-[9px] text-muted-foreground">원</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground w-12">회수물량</span>
                <input type="number" step="500" value={cert.shipQty || ''}
                  placeholder="0" onChange={e => upd(i, { shipQty: parseInt(e.target.value) || 1 })}
                  className="h-5 border rounded text-[10px] px-1 flex-1 text-right" />
                <span className="text-[9px] text-muted-foreground">개</span>
              </div>
              <div className="text-[10px] text-orange-700 text-right font-medium">
                → {cert.shipQty > 0 ? Math.round(cert.totalCostKrw / cert.shipQty).toLocaleString() : 0}원/개
              </div>
            </div>
          ))}
          {certs.length === 0 && <div className="text-[10px] text-muted-foreground text-center py-3">인증을 추가하세요</div>}
        </div>
        <div className="border-t mt-2 pt-2 space-y-1.5">
          {available.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {available.map(p => (
                <button key={p} onClick={() => addCert(p)}
                  className="text-[10px] px-1.5 py-0.5 border rounded hover:bg-muted">+ {p}</button>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="직접입력"
              onKeyDown={e => e.key === 'Enter' && addCert(customName)}
              className="h-6 border rounded text-[10px] px-1.5 flex-1" />
            <button onClick={() => addCert(customName)} className="h-6 border rounded text-[10px] px-2 hover:bg-muted">추가</button>
          </div>
        </div>
        {totalPerUnit > 0 && (
          <div className="text-[11px] font-bold text-orange-700 text-right mt-2 border-t pt-1.5">
            합계: {Math.round(totalPerUnit).toLocaleString()}원/개
          </div>
        )}
      </div>
    </>
  );
}

// ── 파일 가져오기 다이얼로그 ─────────────────────────────────────────────────
const COL_TYPE_OPTIONS = [
  { value: 'ignore', label: '무시' }, { value: 'name', label: '제품명' },
  { value: 'currency', label: '통화' }, { value: 'fob', label: 'FOB 가격' },
  { value: 'size', label: '박스(LxWxH)' }, { value: 'sizeL', label: '박스 L' },
  { value: 'sizeW', label: '박스 W' }, { value: 'sizeH', label: '박스 H' },
  { value: 'qtyPerBox', label: '입수(/박스)' }, { value: 'weightG', label: '무게(g)' },
  { value: 'selling', label: '판매가' }, { value: 'note', label: '비고' },
];
function parseSize(s: string): [number, number, number] | null {
  const m = String(s).match(/(\d+\.?\d*)[×xX*\s]+(\d+\.?\d*)[×xX*\s]+(\d+\.?\d*)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : null;
}
type SheetData = { name: string; rows: (string | number | null)[][]; maxCols: number };

function ImportDialog({ onImport, onClose }: { onImport: (items: EstimatorItem[]) => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0);
  const [headerRowIdx, setHeaderRowIdx] = useState<number | null>(null);
  const [colTypes, setColTypes] = useState<string[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState<'USD' | 'CNY'>('USD');
  const [step, setStep] = useState<'upload' | 'select'>('upload');
  const currentSheet = sheets[selectedSheetIdx];

  const handleFile = async (file: File) => {
    setLoading(true); setError(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/estimator/parse-file', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || '파싱 실패'); setLoading(false); return; }
      setSheets(data.sheets || []); setSheetNames(data.sheetNames || []);
      setSelectedSheetIdx(0); setHeaderRowIdx(null); setColTypes([]); setStep('select');
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };
  const changeSheet = (i: number) => { setSelectedSheetIdx(i); setHeaderRowIdx(null); setColTypes([]); };
  const selectHeaderRow = (ri: number) => {
    setHeaderRowIdx(ri);
    if (!currentSheet) return;
    const types = (currentSheet.rows[ri] || []).map(v => {
      const h = String(v ?? '').toLowerCase();
      if (/품명|제품명|name|item|model|모델|desc/.test(h)) return 'name';
      if (/fob|가격|price|단가|unit.?price/.test(h)) return 'fob';
      if (/사이즈|size|carton|박스|box/.test(h)) return 'size';
      if (/입수|pcs.*box|per.*box|qty.*box/.test(h)) return 'qtyPerBox';
      if (/통화|currency/.test(h)) return 'currency';
      if (/무게|weight|중량/.test(h)) return 'weightG';
      if (/판매가|selling/.test(h)) return 'selling';
      if (/비고|remark|note|memo/.test(h)) return 'note';
      return 'ignore';
    });
    setColTypes(types);
  };
  const doImport = () => {
    if (!currentSheet || headerRowIdx === null) return;
    const items: EstimatorItem[] = [];
    for (const row of currentSheet.rows.slice(headerRowIdx + 1)) {
      const item: EstimatorItem = { ...newItem() };
      let hasData = false; let sL = 0, sW = 0, sH = 0;
      colTypes.forEach((ct, ci) => {
        const val = row[ci]; if (val === null || val === undefined || val === '') return;
        hasData = true; const str = String(val).trim(); const num = parseFloat(str);
        if (ct === 'name') item.name = str;
        else if (ct === 'currency') item.currency = /rmb|cny|위안|元/.test(str.toLowerCase()) ? 'CNY' : 'USD';
        else if (ct === 'fob' && !isNaN(num)) item.fobPrice = num;
        else if (ct === 'size') { const sz = parseSize(str); if (sz) [item.boxL, item.boxW, item.boxH] = sz; }
        else if (ct === 'sizeL' && !isNaN(num)) sL = num;
        else if (ct === 'sizeW' && !isNaN(num)) sW = num;
        else if (ct === 'sizeH' && !isNaN(num)) sH = num;
        else if (ct === 'qtyPerBox' && !isNaN(num)) item.qtyPerBox = num || 1;
        else if (ct === 'weightG' && !isNaN(num)) item.weightG = num;
        else if (ct === 'selling' && !isNaN(num)) item.sellingPrice = num;
        else if (ct === 'note') item.note = str;
      });
      if (sL > 0) { item.boxL = sL; item.boxW = sW; item.boxH = sH; }
      if (!item.currency) item.currency = defaultCurrency;
      if (hasData && (item.name || item.fobPrice > 0)) items.push(item);
    }
    onImport(items);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /><span className="font-semibold text-sm">파일에서 제품 가져오기</span></div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {step === 'upload' && (
            <>
              <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 cursor-pointer hover:bg-muted/30 transition-colors">
                <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                <div className="text-sm font-medium">Excel(.xlsx, .xls) 파일을 클릭하거나 드래그</div>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
              {loading && <div className="text-center py-4 text-muted-foreground text-sm">파일 읽는 중...</div>}
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
            </>
          )}
          {step === 'select' && currentSheet && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                {sheetNames.length > 1 && sheetNames.map((n, i) => (
                  <button key={i} onClick={() => changeSheet(i)}
                    className={cn('px-2 py-1 rounded border text-xs', i === selectedSheetIdx ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{n}</button>
                ))}
                <div className="flex items-center gap-1.5 text-xs ml-auto">
                  <span className="text-muted-foreground">기본 통화:</span>
                  <select className="border rounded px-1.5 py-1 text-xs" value={defaultCurrency} onChange={e => setDefaultCurrency(e.target.value as 'USD' | 'CNY')}>
                    <option value="USD">USD</option><option value="CNY">RMB</option>
                  </select>
                </div>
                <button className="text-xs text-muted-foreground underline" onClick={() => { setStep('upload'); setSheets([]); }}>다른 파일</button>
              </div>
              <div className="text-xs bg-blue-50 border border-blue-200 rounded px-3 py-2 text-blue-800">
                <strong>① 헤더 행 클릭</strong> → <strong>② 드롭다운 확인</strong> → <strong>③ 가져오기</strong>
                {headerRowIdx !== null && <span className="ml-2 text-green-700">✓ {headerRowIdx + 1}행 선택</span>}
              </div>
              {headerRowIdx !== null && (
                <div className="border rounded overflow-auto max-h-12 bg-amber-50/50">
                  <table className="text-[10px] w-max"><tbody><tr>
                    <td className="px-2 py-1 text-muted-foreground border-r w-10">컬럼</td>
                    {colTypes.map((ct, ci) => (
                      <td key={ci} className="px-1 py-1 border-r min-w-[90px]">
                        <select className="text-[10px] border rounded px-1 w-full" value={ct}
                          onChange={e => setColTypes(p => { const n = [...p]; n[ci] = e.target.value; return n; })}>
                          {COL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr></tbody></table>
                </div>
              )}
              <div className="border rounded-lg overflow-auto" style={{ maxHeight: '55vh' }}>
                <table className="text-[10px] border-collapse w-max">
                  <thead className="sticky top-0 z-10 bg-muted/80"><tr>
                    <th className="border px-1 py-1 w-8 text-muted-foreground font-normal sticky left-0 bg-muted/80">#</th>
                    {Array.from({ length: currentSheet.maxCols }, (_, ci) => (
                      <th key={ci} className="border px-2 py-1 font-normal text-muted-foreground min-w-[80px]">
                        {headerRowIdx !== null
                          ? <span className={cn('text-[9px] font-bold', colTypes[ci] !== 'ignore' ? 'text-primary' : '')}>{COL_TYPE_OPTIONS.find(o => o.value === (colTypes[ci] || 'ignore'))?.label}</span>
                          : String.fromCharCode(65 + ci)}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {currentSheet.rows.map((row, ri) => {
                      const isHeader = ri === headerRowIdx, isData = headerRowIdx !== null && ri > headerRowIdx;
                      return (
                        <tr key={ri} onClick={() => selectHeaderRow(ri)}
                          className={cn('border-b cursor-pointer transition-colors',
                            isHeader ? 'bg-amber-100 hover:bg-amber-200' : isData ? 'hover:bg-blue-50/50' : 'hover:bg-muted/40')}>
                          <td className={cn('border px-1 py-0.5 text-[9px] sticky left-0', isHeader ? 'bg-amber-100 text-amber-900' : 'bg-background text-muted-foreground')}>{ri + 1}</td>
                          {Array.from({ length: currentSheet.maxCols }, (_, ci) => (
                            <td key={ci} className={cn('border px-2 py-0.5 truncate max-w-[150px]', isHeader ? 'font-bold text-amber-900' : '',
                              colTypes[ci] && colTypes[ci] !== 'ignore' && isData ? 'bg-blue-50/30' : '')}>
                              {row[ci] != null ? String(row[ci]) : ''}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 py-3.5 border-t shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1">취소</Button>
          <Button onClick={doImport} disabled={step !== 'select' || headerRowIdx === null} className="flex-1">
            <Check className="w-3.5 h-3.5 mr-1" />
            {headerRowIdx !== null && currentSheet
              ? `${currentSheet.rows.slice(headerRowIdx + 1).filter(r => r.some(v => v != null && v !== '')).length}개 가져오기`
              : '헤더 행 선택'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function EstimatorPage() {
  const [cases, setCases] = useState<EstimatorCase[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EstimatorCase | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [showNewCase, setShowNewCase] = useState(false);
  const [certEditorItem, setCertEditorItem] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attUploading, setAttUploading] = useState(false);
  const [userName, setUserName] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.user?.name) setUserName(d.user.name); }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/estimator').then(r => r.json()).then(d => {
      const list = d.data || [];
      setCases(list);
      if (list.length > 0) { setActiveId(list[0].id); setDraft(list[0]); }
    });
  }, []);

  useEffect(() => {
    if (!activeId) { setAttachments([]); return; }
    fetch(`/api/estimator/${activeId}/attachments`).then(r => r.json()).then(d => setAttachments(d.data || [])).catch(() => {});
  }, [activeId]);

  const doSave = useCallback(async (data: EstimatorCase) => {
    setSaving(true);
    await fetch(`/api/estimator/${data.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    setLastSaved(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  }, []);

  const saveDraft = useCallback((next: EstimatorCase) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(next), 800);
  }, [doSave]);

  const createCase = async (baseName?: string) => {
    const name = (baseName || newCaseName).trim() || '새 케이스';
    const res = await fetch('/api/estimator', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setCases(prev => [data.data, ...prev]);
    setActiveId(data.data.id); setDraft(data.data);
    setShowNewCase(false); setNewCaseName('');
    return data.data;
  };

  const copyCase = async () => {
    if (!draft) return;
    const res = await fetch('/api/estimator', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draft.name + ' (복사)' }),
    });
    const data = await res.json();
    await fetch(`/api/estimator/${data.data.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, id: data.data.id, name: draft.name + ' (복사)' }),
    });
    const refetch = await fetch('/api/estimator').then(r => r.json());
    const list = refetch.data || [];
    setCases(list);
    const copied = list.find((c: EstimatorCase) => c.id === data.data.id);
    if (copied) { setActiveId(copied.id); setDraft(copied); }
  };

  const deleteCase = async (id: string) => {
    if (!confirm('케이스를 삭제할까요?')) return;
    await fetch(`/api/estimator/${id}`, { method: 'DELETE' });
    const next = cases.filter(c => c.id !== id);
    setCases(next);
    if (activeId === id) { setActiveId(next[0]?.id || null); setDraft(next[0] || null); }
  };

  const switchCase = (c: EstimatorCase) => {
    setActiveId(c.id); setDraft(c); setCertEditorItem(null);
  };

  const updateField = <K extends keyof EstimatorCase>(key: K, val: EstimatorCase[K]) => {
    if (!draft) return; saveDraft({ ...draft, [key]: val });
  };
  const addItem = () => { if (!draft) return; saveDraft({ ...draft, items: [...draft.items, newItem()] }); };
  const updateItem = (idx: number, patch: Partial<EstimatorItem>) => {
    if (!draft) return;
    saveDraft({ ...draft, items: draft.items.map((it, i) => i === idx ? { ...it, ...patch } : it) });
  };
  const removeItem = (idx: number) => {
    if (!draft) return; saveDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) });
  };
  const duplicateItem = (idx: number) => {
    if (!draft) return;
    const copy = { ...draft.items[idx], id: Math.random().toString(36).slice(2) };
    const items = [...draft.items]; items.splice(idx + 1, 0, copy);
    saveDraft({ ...draft, items });
  };
  const importItems = (items: EstimatorItem[]) => {
    if (!draft) return;
    saveDraft({ ...draft, items: [...draft.items, ...items] });
    setShowImport(false);
  };

  const uploadAttachment = async (files: FileList | null) => {
    if (!files || !activeId) return;
    setAttUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/estimator/${activeId}/attachments`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.data) setAttachments(prev => [...prev, data.data]);
    }
    setAttUploading(false);
  };

  const deleteAttachment = async (attId: string) => {
    if (!activeId) return;
    await fetch(`/api/estimator/${activeId}/attachments`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attId }),
    });
    setAttachments(prev => prev.filter(a => a.id !== attId));
  };

  const handlePrint = () => {
    if (!draft) return;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const parts = [draft.name, dateStr, userName].filter(Boolean);
    const prev = document.title;
    document.title = parts.join('_');
    window.print();
    setTimeout(() => { document.title = prev; }, 2000);
  };

  const inCls = 'h-7 text-xs px-1.5 w-full';

  if (!draft) return (
    <div className="flex flex-col h-full">
      <AppHeader title="원가계산기" />
      <div className="flex-1 flex items-center justify-center flex-col gap-4">
        <div className="text-muted-foreground text-sm">케이스가 없습니다</div>
        <Button onClick={() => setShowNewCase(true)}><Plus className="w-3.5 h-3.5 mr-1" />새 케이스 만들기</Button>
        {showNewCase && (
          <div className="flex gap-2 mt-2">
            <Input value={newCaseName} onChange={e => setNewCaseName(e.target.value)} placeholder="케이스명"
              className="h-9 w-48" autoFocus onKeyDown={e => e.key === 'Enter' && createCase()} />
            <Button onClick={() => createCase()}>만들기</Button>
          </div>
        )}
      </div>
    </div>
  );

  const c = draft;
  const seaUsd = getSeaUsd(c);
  const seaKrw = getSeaKrw(c);
  const totalFreightKrw = seaKrw + (c.freightInland || 0) + (c.freightPort || 0) + (c.freightMisc || 0);
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="flex flex-col h-full">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body, html { background: white !important; }

          /* 화면 UI 전체 숨김 */
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .screen-only { display: none !important; }

          /* 인쇄 전용 레포트만 표시 */
          .print-report {
            display: block !important;
            position: fixed; top: 0; left: 0; width: 100%; height: auto;
            background: white; z-index: 9999;
          }
          .print-report table {
            width: 100%;
            border-collapse: collapse;
            font-size: 7.5px;
            table-layout: auto;
          }
          .print-report th, .print-report td {
            border: 1px solid #bbb;
            padding: 2px 4px;
            white-space: nowrap;
          }
          .print-report thead tr {
            background: #f0f0f0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-report tr { page-break-inside: avoid; }

          /* 비고 textarea 숨김 */
          .notes-textarea { display: none !important; }
          .notes-print { display: block !important; }
        }
        .print-only { display: none; }
        .notes-print { display: none; }
        .print-report { display: none; }
      `}</style>

      {/* ───── 인쇄 전용 레포트 ───── */}
      {c && (() => {
        const today2 = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
        const thStyle: React.CSSProperties = { background: '#f0f0f0', fontWeight: 600, textAlign: 'center' };
        const tdR: React.CSSProperties = { textAlign: 'right' };
        const tdC: React.CSSProperties = { textAlign: 'center' };
        return (
          <div className="print-report" style={{ padding: '4mm', fontFamily: 'sans-serif', fontSize: '8px' }}>
            {/* 레포트 헤더 */}
            <div style={{ borderBottom: '2px solid #333', paddingBottom: '6px', marginBottom: '8px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{c.name} — 원가계산서</div>
              <div style={{ fontSize: '9px', marginTop: '4px', display: 'flex', gap: '16px', flexWrap: 'wrap', color: '#444' }}>
                <span>인쇄일: {today2}</span>
                {userName && <span>작성인: {userName}</span>}
                <span>컨테이너: {c.containerType} ({CONTAINER_CBM[c.containerType]}CBM)</span>
                <span>구매환율: USD {c.fxUsd}원 / RMB {c.fxRmb}원</span>
                <span>판매환율: USD {c.fxUsdSell}원 / RMB {c.fxRmbSell}원</span>
                <span>기본관세율: {(c.dutyRate * 100).toFixed(1)}%</span>
                {c.eprRate > 0 && <span>EPR: {c.eprRate}원/kg</span>}
                {c.freightSeaUsd && <span>해상운임: ${c.freightSeaUsd.toLocaleString()}</span>}
              </div>
            </div>

            {/* 메인 테이블 */}
            <table>
              <thead>
                <tr>
                  <th style={thStyle}>제품명</th>
                  <th style={thStyle}>통화</th>
                  <th style={thStyle}>FOB가</th>
                  <th style={thStyle}>박스(mm) L×W×H</th>
                  <th style={thStyle}>입수</th>
                  <th style={thStyle}>무게(g)</th>
                  <th style={thStyle}>관세율</th>
                  <th style={thStyle}>CBM/박스</th>
                  <th style={thStyle}>적재수</th>
                  <th style={thStyle}>CIF(USD)</th>
                  <th style={thStyle}>관세/개</th>
                  <th style={thStyle}>내륙·항/개</th>
                  {c.eprRate > 0 && <th style={thStyle}>EPR/개</th>}
                  <th style={thStyle}>인증비/개</th>
                  <th style={thStyle}>DDP(USD)</th>
                  <th style={thStyle}>DDP(KRW)</th>
                  <th style={thStyle}>DDP(RMB)</th>
                  <th style={thStyle}>판매통화/가</th>
                  <th style={thStyle}>판매가(KRW)</th>
                  <th style={thStyle}>이익(KRW)</th>
                  <th style={thStyle}>마진율</th>
                  <th style={thStyle}>비고</th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((item, idx) => {
                  const r = calcItem(item, c);
                  const autoBigo: string[] = [];
                  if (r.certPerUnitKrw > 0) {
                    const names = (item.certs || []).map(ce => ce.name).join(', ');
                    autoBigo.push(`인증비 ${Math.round(r.certPerUnitKrw).toLocaleString()}원/개${names ? ` (${names})` : ''}`);
                  }
                  if (r.eprPerUnitKrw > 0) autoBigo.push(`EPR ${Math.round(r.eprPerUnitKrw).toLocaleString()}원/개`);
                  if (item.dutyRateOverride !== undefined) autoBigo.push(`관세 개별${fmtPct(item.dutyRateOverride)}`);
                  const bigoText = [...autoBigo, item.note || ''].filter(Boolean).join(' | ');
                  const profitColor = r.profitKrw !== undefined && r.profitKrw < 0 ? '#cc0000' : '#006600';
                  const marginColor = r.marginKrw !== undefined
                    ? (r.marginKrw < 0.05 ? '#cc0000' : r.marginKrw < 0.1 ? '#cc6600' : '#006600') : '#333';
                  return (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ fontWeight: 500 }}>{item.name}</td>
                      <td style={tdC}>{item.currency}</td>
                      <td style={tdR}>{item.fobPrice}</td>
                      <td style={tdC}>{item.boxL}×{item.boxW}×{item.boxH}</td>
                      <td style={tdR}>{item.qtyPerBox}</td>
                      <td style={tdR}>{item.weightG || '-'}</td>
                      <td style={tdR}>{fmtPct(r.dutyRate)}</td>
                      <td style={tdR}>{r.cbmPerBox > 0 ? r.cbmPerBox.toFixed(4) : '-'}</td>
                      <td style={tdR}>{r.qtyPerContainer > 0 ? r.qtyPerContainer.toLocaleString() : '-'}</td>
                      <td style={tdR}>{fmtUsd(r.cifUsd)}</td>
                      <td style={tdR}>{fmtUsd(r.dutyPerUnitUsd)}</td>
                      <td style={tdR}>{r.otherPerUnitKrw > 0 ? fmtKrw(r.otherPerUnitKrw) : '-'}</td>
                      {c.eprRate > 0 && <td style={{ ...tdR, color: '#006600' }}>{r.eprPerUnitKrw > 0 ? fmtKrw(r.eprPerUnitKrw) : '-'}</td>}
                      <td style={{ ...tdR, color: '#c05000' }}>{r.certPerUnitKrw > 0 ? fmtKrw(r.certPerUnitKrw) : '-'}</td>
                      <td style={{ ...tdR, fontWeight: 600, color: '#004400' }}>{fmtUsd(r.ddpUsd)}</td>
                      <td style={{ ...tdR, fontWeight: 600, color: '#004400' }}>{fmtKrw(r.ddpKrw)}</td>
                      <td style={{ ...tdR, color: '#004400' }}>{fmtRmb(r.ddpRmb)}</td>
                      <td style={tdR}>{item.sellingPrice ? `${item.sellingCurrency || 'USD'} ${item.sellingPrice}` : '-'}</td>
                      <td style={{ ...tdR, color: '#884400' }}>{r.sellingKrw !== undefined ? fmtKrw(r.sellingKrw) : '-'}</td>
                      <td style={{ ...tdR, color: profitColor, fontWeight: 600 }}>{r.profitKrw !== undefined ? fmtKrw(r.profitKrw) : '-'}</td>
                      <td style={{ ...tdR, color: marginColor, fontWeight: 700 }}>{fmtPct(r.marginKrw)}</td>
                      <td style={{ fontSize: '7px', color: '#444', whiteSpace: 'normal', maxWidth: '80px' }}>{bigoText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 비고/메모 */}
            {c.notes && (
              <div style={{ marginTop: '10px', borderTop: '1px solid #ccc', paddingTop: '6px', fontSize: '9px' }}>
                <strong>비고:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{c.notes}</span>
              </div>
            )}
          </div>
        );
      })()}

      <AppHeader title="원가계산기" />
      <div className="flex flex-1 overflow-hidden print-root screen-only">

        {/* 사이드바 */}
        <div className="w-44 shrink-0 border-r flex flex-col bg-muted/20 no-print">
          <div className="px-2 py-2 border-b flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">케이스</span>
            <button onClick={() => setShowNewCase(!showNewCase)} className="text-primary hover:text-primary/80"><Plus className="w-3.5 h-3.5" /></button>
          </div>
          {showNewCase && (
            <div className="p-2 border-b">
              <Input value={newCaseName} onChange={e => setNewCaseName(e.target.value)} placeholder="케이스명"
                className="h-7 text-xs mb-1" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') createCase(); if (e.key === 'Escape') setShowNewCase(false); }} />
              <Button size="sm" className="w-full h-6 text-xs" onClick={() => createCase()}>만들기</Button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {cases.map(cc => (
              <div key={cc.id} onClick={() => switchCase(cc)}
                className={cn('px-2 py-2 cursor-pointer border-b text-xs group flex items-start justify-between gap-1',
                  activeId === cc.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50')}>
                <div className="truncate flex-1">{cc.name}</div>
                <button onClick={e => { e.stopPropagation(); deleteCase(cc.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* 메인 */}
        <div className="flex-1 flex flex-col overflow-hidden print-main">

          {/* 설정 패널 */}
          <div className="border-b px-4 py-3 bg-background shrink-0 space-y-3 no-print">
            {/* 1행 */}
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">케이스명</div>
                <div className="flex items-center gap-2">
                  <Input value={c.name} onChange={e => updateField('name', e.target.value)} className="h-7 text-xs font-semibold w-40" />
                  <span className="text-[10px] text-muted-foreground">
                    {saving ? '저장 중...' : lastSaved ? `✓ ${lastSaved}` : ''}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">컨테이너</div>
                <select className="h-7 border rounded text-xs px-2" value={c.containerType}
                  onChange={e => updateField('containerType', e.target.value as EstimatorCase['containerType'])}>
                  {(['20ft', '40ft', '40HQ'] as const).map(t => <option key={t} value={t}>{t} ({CONTAINER_CBM[t]}CBM)</option>)}
                </select>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">시뮬레이션 모드</div>
                <div className="flex gap-1">
                  {([['standard','표준계산'], ['reverse','판매가역산'], ['mixed','혼적']] as const).map(([mode, label]) => (
                    <button key={mode} onClick={() => updateField('simMode', mode)}
                      className={cn('px-2.5 py-1 rounded text-xs border transition-colors',
                        c.simMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => draft && doSave(draft)} disabled={saving}>
                  <Save className="w-3 h-3 mr-1" />저장
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copyCase} title="케이스 복사">
                  <Copy className="w-3 h-3 mr-1" />복사
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handlePrint}>
                  <Printer className="w-3 h-3 mr-1" />인쇄
                </Button>
              </div>
            </div>
            {/* 2행: 3섹션 */}
            <div className="grid grid-cols-3 gap-5 border-t pt-2.5">
              {/* 운임 */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">운임</div>
                <div className="space-y-1.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-10">해상</span>
                      <input type="number" step="10" value={seaUsd || ''} placeholder="0"
                        onChange={e => updateField('freightSeaUsd', parseFloat(e.target.value) || 0)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">USD ≈ {seaKrw.toLocaleString()}원</span>
                    </div>
                  </div>
                  {([['freightInland','내륙'],['freightPort','포트'],['freightMisc','기타']] as const).map(([k, label]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-10">{label}</span>
                      <input type="number" step="10000" value={c[k] || ''} placeholder="0"
                        onChange={e => updateField(k, parseInt(e.target.value) || 0)}
                        className="h-6 border rounded text-[10px] px-1.5 w-24 text-right" />
                      <span className="text-[10px] text-muted-foreground">원</span>
                    </div>
                  ))}
                  <div className="text-[10px] text-muted-foreground border-t pt-1">
                    합계: <strong className="text-foreground">{totalFreightKrw.toLocaleString()}원</strong>
                  </div>
                </div>
              </div>
              {/* 환율 */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">환율</div>
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] text-primary/80 mb-1 font-medium">구매·비용 (운임, DDP 계산)</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-16">USD/KRW</span>
                      <input type="number" step="10" value={c.fxUsd || ''}
                        onChange={e => updateField('fxUsd', parseInt(e.target.value) || 1430)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">원</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground w-16">RMB/KRW</span>
                      <input type="number" step="1" value={c.fxRmb || ''}
                        onChange={e => updateField('fxRmb', parseInt(e.target.value) || 195)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">원</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">💡 보수적: 높게 · 현재 USD≈1,380 / RMB≈193원</div>
                  </div>
                  <div className="border-t pt-1.5">
                    <div className="text-[10px] text-purple-700 mb-1 font-medium">판매·견적 (판매가 KRW 표시)</div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-16">USD/KRW</span>
                      <input type="number" step="10" value={c.fxUsdSell || ''}
                        onChange={e => updateField('fxUsdSell', parseInt(e.target.value) || 1380)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">원</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground w-16">RMB/KRW</span>
                      <input type="number" step="1" value={c.fxRmbSell || ''}
                        onChange={e => updateField('fxRmbSell', parseInt(e.target.value) || 195)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">원</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* 관세/EPR */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">관세 / EPR</div>
                <div className="space-y-2.5">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">기본 관세율</div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" step="0.1" value={(c.dutyRate * 100).toFixed(1)}
                        onChange={e => updateField('dutyRate', parseFloat(e.target.value) / 100 || 0)}
                        className="h-6 border rounded text-[10px] px-1.5 w-16 text-right" />
                      <span className="text-[10px] text-muted-foreground">% (CIF 과세, 품목별 개별설정 가능)</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">EPR 환경분담금 단가</div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" step="1" min="0" value={c.eprRate || ''} placeholder="0"
                        onChange={e => updateField('eprRate', parseFloat(e.target.value) || 0)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">원/kg</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                      💡 LED: ~32 · 형광: ~63 · 모니터: ~25원/kg<br />
                      무게(g) 제품 행에 입력 → 자동 계산
                    </div>
                  </div>
                </div>
              </div>
              {/* 판매가 일괄 적용 */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">판매가 일괄 적용</div>
                <div className="text-[10px] text-muted-foreground mb-1.5">목표 마진율 선택 → 역산 모드로 전환</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {[5,10,15,20,25,30,40,50].map(pct => (
                    <button key={pct}
                      onClick={() => {
                        const m = pct / 100;
                        setDraft(prev => prev ? {
                          ...prev,
                          simMode: 'reverse',
                          items: prev.items.map(it => ({ ...it, targetMargin: m }))
                        } : prev);
                      }}
                      className="px-2 py-0.5 text-[10px] border rounded hover:bg-primary hover:text-primary-foreground transition-colors">
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">직접입력</span>
                  <input type="number" min="1" max="99" step="1" placeholder="%" id="bulk-margin-input"
                    className="h-6 border rounded text-[10px] px-1.5 w-14 text-right" />
                  <button
                    onClick={() => {
                      const el = document.getElementById('bulk-margin-input') as HTMLInputElement;
                      const pct = parseFloat(el?.value);
                      if (!pct || pct <= 0 || pct >= 100) return;
                      const m = pct / 100;
                      setDraft(prev => prev ? {
                        ...prev,
                        simMode: 'reverse',
                        items: prev.items.map(it => ({ ...it, targetMargin: m }))
                      } : prev);
                      el.value = '';
                    }}
                    className="h-6 px-2 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90">
                    적용
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 인쇄용 헤더 (화면에서는 숨김) */}
          <div className="print-only border-b px-4 py-3">
            <h1 className="text-base font-bold">{c.name} — 원가계산서</h1>
            <div className="text-xs text-gray-600 mt-1 flex gap-6 flex-wrap">
              <span>인쇄일: {today}</span>
              {userName && <span>작성인: {userName}</span>}
              <span>컨테이너: {c.containerType} ({CONTAINER_CBM[c.containerType]}CBM)</span>
              <span>구매환율: 1USD={c.fxUsd}원</span>
              <span>판매환율: 1USD={c.fxUsdSell}원</span>
              <span>관세율: {(c.dutyRate * 100).toFixed(1)}%</span>
              {c.eprRate > 0 && <span>EPR: {c.eprRate}원/kg</span>}
            </div>
          </div>

          {/* 툴바 */}
          <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 no-print">
            {c.simMode === 'mixed' && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                혼적: 각 제품 담당 CBM 입력 (합계 {CONTAINER_CBM[c.containerType]}CBM 이하)
              </div>
            )}
            {c.simMode === 'reverse' && (
              <div className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1">
                역산: 목표 이익률 → 판매가 자동 계산
              </div>
            )}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowImport(true)}>
                <Upload className="w-3 h-3 mr-1" />파일 가져오기
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={addItem}>
                <Plus className="w-3 h-3 mr-1" />제품 추가
              </Button>
            </div>
          </div>

          {/* 테이블 */}
          <div className="flex-1 overflow-auto print-table-wrap" onClick={() => certEditorItem !== null && setCertEditorItem(null)}>
            <table className="text-xs border-collapse w-max min-w-full">
              <thead className="bg-muted/70 sticky top-0 z-10">
                <tr>
                  <th className="border px-2 py-1.5 text-left font-medium min-w-[150px] sticky left-0 bg-muted/70 z-20">제품명</th>
                  <th className="border px-2 py-1.5 font-medium w-14">통화</th>
                  <th className="border px-2 py-1.5 font-medium w-20">FOB가</th>
                  <th className="border px-2 py-1.5 font-medium w-32">박스 L×W×H(mm)</th>
                  <th className="border px-2 py-1.5 font-medium w-14">입수</th>
                  <th className="border px-2 py-1.5 font-medium w-16" title="단중(g/pcs) — EPR 계산에 사용">무게(g)</th>
                  {c.simMode === 'mixed' && <th className="border px-2 py-1.5 font-medium w-16 bg-blue-50">CBM</th>}
                  <th className="border px-2 py-1.5 font-medium w-16">관세율</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-orange-50/60" title="클릭하여 인증비 설정">인증비</th>
                  <th className="border px-2 py-1.5 font-medium w-32" title="통화 선택 후 판매가 입력">판매통화 / 판매가</th>
                  {/* 결과 */}
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50/70">FOB USD</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50/70">CBM/박스</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-sky-50/70">적재수</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-sky-50/70" title="FOB + 해상운임 (관세 과세가격)">CIF</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50/70">관세/개</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50/70">내륙포트</th>
                  {c.eprRate > 0 && <th className="border px-2 py-1.5 font-medium w-16 bg-emerald-50/60">EPR/개</th>}
                  <th className="border px-2 py-1.5 font-medium w-16 bg-orange-50/60">인증비/개</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-green-50">DDP(USD)</th>
                  <th className="border px-2 py-1.5 font-medium w-22 bg-green-50">DDP(KRW)</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-green-50">DDP(RMB)</th>
                  <th className="border px-2 py-1.5 font-medium w-22 bg-amber-50" title={`판매환율 ${c.fxUsdSell}원`}>판매가(KRW)</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-amber-50">이익(KRW)</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-amber-50">이익률</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-amber-50">물류비%</th>
                  <th className="border px-2 py-1.5 font-medium min-w-[180px]">비고</th>
                  <th className="border px-1 py-1.5 w-12 sticky right-0 bg-muted/70 no-print"></th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((item, idx) => {
                  const r = calcItem(item, c);
                  const marginColor = r.marginKrw !== undefined
                    ? r.marginKrw >= 0.15 ? 'text-green-700' : r.marginKrw >= 0.08 ? 'text-amber-700' : 'text-red-600'
                    : '';
                  const certTotal = r.certPerUnitKrw;
                  const hasCert = (item.certs || []).length > 0;

                  return (
                    <tr key={item.id} className="border-b hover:bg-muted/20" onClick={e => e.stopPropagation()}>
                      <td className="border px-1 py-1 sticky left-0 bg-background">
                        <input value={item.name} onChange={e => updateItem(idx, { name: e.target.value })}
                          placeholder="제품명" className={cn(inCls, 'min-w-[140px]')} />
                      </td>
                      <td className="border px-1 py-1">
                        <select value={item.currency} onChange={e => updateItem(idx, { currency: e.target.value as 'USD' | 'CNY' })}
                          className="h-7 border-0 rounded text-xs w-full">
                          <option value="USD">USD</option><option value="CNY">RMB</option>
                        </select>
                      </td>
                      <td className="border px-1 py-1">
                        <input type="number" step="0.01" value={item.fobPrice || ''}
                          onChange={e => updateItem(idx, { fobPrice: parseFloat(e.target.value) || 0 })}
                          className={cn(inCls, 'text-right')} placeholder="0.00" />
                      </td>
                      <td className="border px-1 py-1">
                        <div className="flex gap-0.5 items-center">
                          {(['boxL', 'boxW', 'boxH'] as const).map((k, i) => (
                            <React.Fragment key={k}>
                              <input type="number" value={item[k] || ''}
                                onChange={e => updateItem(idx, { [k]: parseFloat(e.target.value) || 0 })}
                                className="h-7 border rounded text-[10px] px-1 w-14 text-right"
                                placeholder={['L','W','H'][i]} />
                              {i < 2 && <span className="text-muted-foreground text-[10px]">×</span>}
                            </React.Fragment>
                          ))}
                        </div>
                      </td>
                      <td className="border px-1 py-1">
                        <input type="number" value={item.qtyPerBox || ''} onChange={e => updateItem(idx, { qtyPerBox: parseInt(e.target.value) || 1 })}
                          className={cn(inCls, 'text-right')} />
                      </td>
                      <td className="border px-1 py-1">
                        <input type="number" step="1" value={item.weightG || ''} placeholder="g"
                          onChange={e => updateItem(idx, { weightG: parseFloat(e.target.value) || undefined })}
                          className={cn(inCls, 'text-right')} />
                      </td>
                      {c.simMode === 'mixed' && (
                        <td className="border px-1 py-1 bg-blue-50/30">
                          <input type="number" step="0.1" value={item.mixedCbm || ''}
                            onChange={e => updateItem(idx, { mixedCbm: parseFloat(e.target.value) || 0 })}
                            className={cn(inCls, 'text-right bg-blue-50')} placeholder="CBM" />
                        </td>
                      )}
                      <td className="border px-1 py-1">
                        <div className="flex items-center gap-0.5">
                          <input type="number" step="0.1"
                            value={item.dutyRateOverride !== undefined ? (item.dutyRateOverride * 100).toFixed(1) : ''}
                            placeholder={`${(c.dutyRate * 100).toFixed(1)}`}
                            onChange={e => updateItem(idx, { dutyRateOverride: e.target.value ? parseFloat(e.target.value) / 100 : undefined })}
                            className={cn(inCls, 'text-right w-12')} />
                          <span className="text-[10px] text-muted-foreground">%</span>
                        </div>
                      </td>
                      {/* 인증비 팝업 */}
                      <td className="border px-1 py-1 bg-orange-50/20 relative">
                        <button
                          onClick={e => { e.stopPropagation(); setCertEditorItem(certEditorItem === idx ? null : idx); }}
                          className={cn('text-[10px] px-1.5 py-1 rounded border w-full text-center transition-colors',
                            hasCert ? 'bg-orange-50 border-orange-300 text-orange-800 hover:bg-orange-100'
                              : 'border-dashed border-muted-foreground/30 text-muted-foreground hover:border-orange-300 hover:text-orange-600')}>
                          {hasCert ? `₩${Math.round(certTotal).toLocaleString()}/개` : '+ 인증비'}
                        </button>
                        {certEditorItem === idx && (
                          <CertEditorPopup
                            certs={item.certs || []}
                            onChange={certs => updateItem(idx, { certs })}
                            onClose={() => setCertEditorItem(null)}
                          />
                        )}
                      </td>
                      {/* 판매가 통화+금액 */}
                      {c.simMode !== 'reverse' ? (
                        <td className="border px-1 py-1">
                          <div className="flex gap-0.5 items-center">
                            <select value={item.sellingCurrency || 'USD'}
                              onChange={e => updateItem(idx, { sellingCurrency: e.target.value as 'USD' | 'CNY' | 'KRW' })}
                              className="h-7 border rounded text-[9px] w-14 shrink-0">
                              <option value="USD">USD</option>
                              <option value="CNY">RMB</option>
                              <option value="KRW">KRW</option>
                            </select>
                            <input type="number" step={item.sellingCurrency === 'KRW' ? 100 : 0.01}
                              value={item.sellingPrice || ''}
                              onChange={e => updateItem(idx, { sellingPrice: parseFloat(e.target.value) || undefined })}
                              className={cn(inCls, 'text-right')} placeholder="0" />
                          </div>
                        </td>
                      ) : (
                        <td className="border px-1 py-1 bg-purple-50/30">
                          <div className="flex items-center gap-0.5">
                            <input type="number" step="0.1"
                              value={item.targetMargin !== undefined ? (item.targetMargin * 100).toFixed(1) : ''}
                              onChange={e => updateItem(idx, { targetMargin: e.target.value ? parseFloat(e.target.value) / 100 : undefined })}
                              className={cn(inCls, 'text-right w-14 bg-purple-50')} placeholder="15.0" />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                        </td>
                      )}
                      {/* 계산 결과 */}
                      <td className="border px-2 py-1 text-right bg-sky-50/30 text-muted-foreground">{item.currency === 'CNY' ? fmtUsd(r.fobUsd) : '-'}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 text-[10px] text-muted-foreground">{r.cbmPerBox > 0 ? r.cbmPerBox.toFixed(4) : '-'}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 font-medium">{r.qtyPerContainer > 0 ? r.qtyPerContainer.toLocaleString() : '-'}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 font-medium">{fmtUsd(r.cifUsd)}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30">
                        <div>{fmtUsd(r.dutyPerUnitUsd)}</div>
                        <div className="text-[9px] text-muted-foreground">{fmtPct(r.dutyRate)}</div>
                      </td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 text-muted-foreground">{r.otherPerUnitKrw > 0 ? fmtKrw(r.otherPerUnitKrw) : '-'}</td>
                      {c.eprRate > 0 && (
                        <td className="border px-2 py-1 text-right bg-emerald-50/40">
                          {r.eprPerUnitKrw > 0 ? <span className="text-emerald-700">{fmtKrw(r.eprPerUnitKrw)}</span> : <span className="text-muted-foreground">-</span>}
                        </td>
                      )}
                      <td className="border px-2 py-1 text-right bg-orange-50/40">
                        {certTotal > 0 ? <span className="text-orange-700">{fmtKrw(certTotal)}</span> : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="border px-2 py-1 text-right bg-green-50/50 font-bold text-green-800">{fmtUsd(r.ddpUsd)}</td>
                      <td className="border px-2 py-1 text-right bg-green-50/50 text-green-700">{fmtKrw(r.ddpKrw)}</td>
                      <td className="border px-2 py-1 text-right bg-green-50/50 text-green-600 text-[10px]">{fmtRmb(r.ddpRmb)}</td>
                      <td className="border px-2 py-1 text-right bg-amber-50/50">{r.sellingKrw !== undefined ? fmtKrw(r.sellingKrw) : '-'}</td>
                      <td className={cn('border px-2 py-1 text-right bg-amber-50/50',
                        r.profitKrw !== undefined && r.profitKrw < 0 ? 'text-red-600' : 'text-green-700')}>
                        {r.profitKrw !== undefined ? fmtKrw(r.profitKrw) : '-'}
                      </td>
                      <td className={cn('border px-2 py-1 text-right bg-amber-50/50 font-bold', marginColor)}>{fmtPct(r.marginKrw)}</td>
                      <td className="border px-2 py-1 text-right bg-amber-50/50 text-[10px] text-muted-foreground">{r.freightRatio !== undefined ? fmtPct(r.freightRatio) : '-'}</td>
                      {/* 비고: 자동 계산내역 + 직접 입력 */}
                      <td className="border px-2 py-1 min-w-[180px] align-top">
                        <div className="text-[9px] space-y-0.5 mb-1">
                          {certTotal > 0 && (
                            <div className="text-orange-700">
                              인증비 {fmtKrw(certTotal)}/개
                              {(item.certs || []).length > 0 && ` (${(item.certs || []).map(ce => ce.name).join(', ')})`}
                            </div>
                          )}
                          {r.eprPerUnitKrw > 0 && (
                            <div className="text-emerald-700">
                              EPR {fmtKrw(r.eprPerUnitKrw)}/개 ({item.weightG}g × {c.eprRate}원/kg)
                            </div>
                          )}
                          {item.dutyRateOverride !== undefined && (
                            <div className="text-blue-600">관세 개별설정 {fmtPct(item.dutyRateOverride)}</div>
                          )}
                          {item.currency === 'CNY' && (
                            <div className="text-muted-foreground">FOB CNY→USD 환산 포함</div>
                          )}
                        </div>
                        <input
                          type="text"
                          value={item.note || ''}
                          onChange={e => updateItem(idx, { note: e.target.value })}
                          placeholder="메모 입력..."
                          className="w-full text-[10px] border-0 border-b border-dashed bg-transparent focus:outline-none placeholder:text-muted-foreground/30 py-0.5"
                        />
                      </td>
                      <td className="border px-1 py-1 sticky right-0 bg-background no-print">
                        <div className="flex gap-1">
                          <button onClick={() => duplicateItem(idx)} className="text-muted-foreground hover:text-primary p-0.5" title="복사"><Copy className="w-3 h-3" /></button>
                          <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive p-0.5" title="삭제"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* 합계 */}
                {c.items.length > 1 && (() => {
                  const calcs = c.items.map(it => calcItem(it, c));
                  const valid = calcs.filter(r => r.profitKrw !== undefined && r.sellingKrw !== undefined);
                  const avgMargin = valid.length > 0
                    ? valid.reduce((s, r) => s + (r.profitKrw || 0), 0) / valid.reduce((s, r) => s + (r.sellingKrw || 0), 0)
                    : undefined;
                  const mixedColspan = c.simMode === 'mixed' ? 1 : 0;
                  return (
                    <tr className="bg-muted/50 font-semibold border-t-2">
                      <td className="border px-2 py-1.5 sticky left-0 bg-muted/50 text-xs" colSpan={2}>합계 / 평균</td>
                      <td colSpan={4 + mixedColspan} className="border"></td>
                      <td colSpan={2} className="border"></td>
                      {/* cert + selling */}
                      <td colSpan={2} className="border"></td>
                      {/* results */}
                      <td colSpan={3} className="border bg-sky-50/30"></td>
                      {c.eprRate > 0 && <td className="border bg-emerald-50/30"></td>}
                      <td className="border bg-orange-50/30"></td>
                      <td colSpan={3} className="border bg-green-50/40"></td>
                      <td className="border bg-amber-50/40"></td>
                      <td className="border bg-amber-50/40"></td>
                      <td className="border px-2 py-1.5 text-right text-xs bg-amber-50/60 font-bold">
                        {fmtPct(avgMargin)}
                      </td>
                      <td className="border bg-amber-50/40"></td>
                      <td className="border"></td>
                      <td className="border sticky right-0 bg-muted/50 no-print"></td>
                    </tr>
                  );
                })()}
                {c.items.length === 0 && (
                  <tr><td colSpan={26} className="text-center py-12 text-muted-foreground text-sm">
                    <div>제품을 추가하거나 파일에서 가져오세요</div>
                    <div className="flex gap-2 justify-center mt-3">
                      <Button size="sm" variant="outline" onClick={() => setShowImport(true)}><Upload className="w-3 h-3 mr-1" />파일 가져오기</Button>
                      <Button size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" />제품 추가</Button>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 첨부파일 */}
          <div className="border-t px-4 py-2.5 shrink-0 no-print">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                첨부파일 {attachments.length > 0 && `(${attachments.length})`}
              </span>
              <label className="cursor-pointer flex items-center gap-1 text-xs text-primary hover:underline">
                <Paperclip className="w-3 h-3" />
                {attUploading ? '업로드 중...' : '파일 첨부'}
                <input type="file" multiple className="hidden" disabled={attUploading}
                  onChange={e => uploadAttachment(e.target.files)} />
              </label>
            </div>
            {attachments.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-1.5 bg-muted/40 border rounded-md px-2 py-1 text-xs">
                    <FileDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    <a href={`/api/estimator/${activeId}/attachments/${att.id}`} target="_blank"
                      className="hover:underline hover:text-primary truncate max-w-[140px]" title={att.name}>
                      {att.name}
                    </a>
                    <span className="text-muted-foreground text-[10px]">({fmtSize(att.size)})</span>
                    <button onClick={() => deleteAttachment(att.id)} className="text-muted-foreground hover:text-destructive ml-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground/60">공급사 견적서, 원가시트 등을 첨부하세요</div>
            )}
          </div>

          {/* 비고 */}
          <div className="border-t px-4 py-2 shrink-0">
            {/* 인쇄용 비고 (화면에서는 숨김) */}
            <div className="notes-print text-xs">
              <span className="font-semibold">비고:</span>{' '}
              <span className="whitespace-pre-wrap">{c.notes || ''}</span>
            </div>
            {/* 편집용 textarea (인쇄 시 숨김) */}
            <textarea value={c.notes || ''} onChange={e => updateField('notes', e.target.value)}
              placeholder="비고 / 메모" rows={2}
              className="notes-textarea w-full text-xs border rounded px-2 py-1.5 resize-none text-muted-foreground focus:text-foreground" />
          </div>
        </div>
      </div>

      {showImport && <ImportDialog onImport={importItems} onClose={() => setShowImport(false)} />}
    </div>
  );
}
