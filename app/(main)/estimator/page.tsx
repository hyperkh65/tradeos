'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Upload, Copy, FileSpreadsheet, X, Check } from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface EstimatorItem {
  id: string; name: string;
  currency: 'USD' | 'CNY';
  fobPrice: number;
  boxL: number; boxW: number; boxH: number;
  qtyPerBox: number;
  weightG?: number;       // 단중 (g/pcs)
  eprWeightG?: number;    // EPR 대상 소재 중량 (g/pcs) - PC·플라스틱 등
  dutyRateOverride?: number;
  sellingPrice?: number;
  targetMargin?: number;
  mixedCbm?: number;
  note?: string;
}

interface EstimatorCase {
  id: string; name: string;
  containerType: '20ft' | '40ft' | '40HQ';
  freightSeaUsd?: number;  // 해상운임 (USD) — 우선 사용
  freightSea: number;      // 해상운임 (KRW) — legacy fallback
  freightInland: number;   // 내륙운송 (KRW)
  freightPort: number;     // 포트차지 (KRW)
  freightMisc: number;     // 기타 (KRW)
  fxUsd: number;           // USD/KRW 적용환율
  fxRmb: number;           // RMB/KRW 적용환율
  dutyRate: number;        // 기본 관세율
  eprRate: number;         // EPR 환경분담금 단가 (원/kg)
  simMode: 'standard' | 'reverse' | 'mixed';
  items: EstimatorItem[];
  notes?: string;
  createdAt: string; updatedAt: string;
}

// ── 상수 ──────────────────────────────────────────────────────────────────────
const CONTAINER_CBM: Record<string, number> = { '20ft': 27, '40ft': 56, '40HQ': 68 };

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function getSeaUsd(c: EstimatorCase): number {
  return c.freightSeaUsd != null ? c.freightSeaUsd : Math.round((c.freightSea || 0) / (c.fxUsd || 1430));
}
function getSeaKrw(c: EstimatorCase): number {
  return Math.round(getSeaUsd(c) * (c.fxUsd || 1430));
}
function getTotalFreightKrw(c: EstimatorCase): number {
  return getSeaKrw(c) + (c.freightInland || 0) + (c.freightPort || 0) + (c.freightMisc || 0);
}

// ── 계산 함수 ──────────────────────────────────────────────────────────────────
function calcItem(item: EstimatorItem, c: EstimatorCase) {
  const fxUsd = c.fxUsd || 1430;
  const fxRmb = c.fxRmb || 195;
  const containerCbm = CONTAINER_CBM[c.containerType] || 56;

  // FOB → USD
  const fobUsd = item.currency === 'CNY' ? item.fobPrice * (fxRmb / fxUsd) : item.fobPrice;

  // CBM/박스 (m³)
  const cbmPerBox = item.boxL > 0 && item.boxW > 0 && item.boxH > 0
    ? (item.boxL * item.boxW * item.boxH) / 1_000_000 : 0;

  // 적재 수량
  let qtyPerContainer = 0;
  if (c.simMode === 'mixed' && item.mixedCbm && item.mixedCbm > 0) {
    qtyPerContainer = cbmPerBox > 0 ? Math.floor(item.mixedCbm / cbmPerBox) * item.qtyPerBox : 0;
  } else {
    qtyPerContainer = cbmPerBox > 0 ? Math.floor(containerCbm / cbmPerBox) * item.qtyPerBox : 0;
  }

  // 해상운임 (KRW)
  const freightSeaKrw = getSeaKrw(c);
  // 내륙+포트+기타 (KRW) — 관세 과세 기준 제외, DDP에 직접 합산
  const otherFreightKrw = (c.freightInland || 0) + (c.freightPort || 0) + (c.freightMisc || 0);

  const seaPerUnitUsd = qtyPerContainer > 0 ? freightSeaKrw / qtyPerContainer / fxUsd : 0;
  const otherPerUnitKrw = qtyPerContainer > 0 ? otherFreightKrw / qtyPerContainer : 0;
  const totalFreightPerUnitUsd = qtyPerContainer > 0
    ? (freightSeaKrw + otherFreightKrw) / qtyPerContainer / fxUsd : 0;

  // CIF = FOB + 해상운임/개 (관세 과세가격 기준)
  const cifUsd = fobUsd + seaPerUnitUsd;
  const dutyRate = item.dutyRateOverride ?? c.dutyRate;
  const dutyPerUnitUsd = cifUsd * dutyRate;

  // 환경분담금 (KRW/개) = EPR 소재 중량(kg) × 단가(원/kg)
  const eprPerUnitKrw = ((item.eprWeightG || 0) / 1000) * (c.eprRate || 0);

  // DDP = (CIF + 관세) × 환율 + 내륙/포트 + EPR
  const ddpKrw = (cifUsd + dutyPerUnitUsd) * fxUsd + otherPerUnitKrw + eprPerUnitKrw;
  const ddpUsd = ddpKrw / fxUsd;

  // 판매가 / 이익
  let sellingUsd: number | undefined;
  let profitUsd: number | undefined;
  let marginPct: number | undefined;

  if (c.simMode === 'reverse' && item.targetMargin !== undefined) {
    const m = Math.min(Math.max(item.targetMargin, 0), 0.99);
    sellingUsd = ddpUsd / (1 - m);
    profitUsd = sellingUsd - ddpUsd;
    marginPct = item.targetMargin;
  } else if (item.sellingPrice !== undefined && item.sellingPrice > 0) {
    sellingUsd = item.sellingPrice;
    profitUsd = sellingUsd - ddpUsd;
    marginPct = sellingUsd > 0 ? profitUsd / sellingUsd : 0;
  }

  const sellingKrw = sellingUsd !== undefined ? sellingUsd * fxUsd : undefined;
  const freightRatio = sellingUsd && sellingUsd > 0 ? totalFreightPerUnitUsd / sellingUsd : undefined;

  return {
    fobUsd, cbmPerBox, qtyPerContainer,
    seaPerUnitUsd, otherPerUnitKrw, totalFreightPerUnitUsd,
    cifUsd, dutyPerUnitUsd, dutyRate,
    eprPerUnitKrw, ddpUsd, ddpKrw,
    sellingUsd, sellingKrw, profitUsd, marginPct, freightRatio,
  };
}

function fmtUsd(n?: number) {
  if (n === undefined || isNaN(n) || !isFinite(n)) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtKrw(n?: number) {
  if (n === undefined || isNaN(n) || !isFinite(n)) return '-';
  return Math.round(n).toLocaleString() + '원';
}
function fmtPct(n?: number) {
  if (n === undefined || isNaN(n) || !isFinite(n)) return '-';
  return (n * 100).toFixed(1) + '%';
}

const newItem = (): EstimatorItem => ({
  id: Math.random().toString(36).slice(2),
  name: '', currency: 'USD', fobPrice: 0,
  boxL: 0, boxW: 0, boxH: 0, qtyPerBox: 1,
});

// ── 파일 가져오기 다이얼로그 ─────────────────────────────────────────────────
const COL_TYPE_OPTIONS = [
  { value: 'ignore', label: '무시' },
  { value: 'name', label: '제품명' },
  { value: 'currency', label: '통화' },
  { value: 'fob', label: 'FOB 가격' },
  { value: 'size', label: '박스사이즈(LxWxH)' },
  { value: 'sizeL', label: '박스 L(cm)' },
  { value: 'sizeW', label: '박스 W(cm)' },
  { value: 'sizeH', label: '박스 H(cm)' },
  { value: 'qtyPerBox', label: '입수(/박스)' },
  { value: 'weightG', label: '단중(g)' },
  { value: 'selling', label: '판매가' },
  { value: 'note', label: '비고' },
];

function parseSize(s: string): [number, number, number] | null {
  const m = String(s).match(/(\d+\.?\d*)[×xX*\s]+(\d+\.?\d*)[×xX*\s]+(\d+\.?\d*)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  return null;
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
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/estimator/parse-file', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || '파싱 실패'); setLoading(false); return; }
      setSheets(data.sheets || []);
      setSheetNames(data.sheetNames || []);
      setSelectedSheetIdx(0);
      setHeaderRowIdx(null);
      setColTypes([]);
      setStep('select');
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  const changeSheet = (idx: number) => { setSelectedSheetIdx(idx); setHeaderRowIdx(null); setColTypes([]); };

  const selectHeaderRow = (rowIdx: number) => {
    setHeaderRowIdx(rowIdx);
    if (!currentSheet) return;
    const headerRow = currentSheet.rows[rowIdx] || [];
    const types = headerRow.map(v => {
      const h = String(v ?? '').toLowerCase();
      if (/품명|제품명|name|item|model|모델|description/.test(h)) return 'name';
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
      let hasData = false;
      let sizeL = 0, sizeW = 0, sizeH = 0;
      colTypes.forEach((ct, ci) => {
        const val = row[ci];
        if (val === null || val === undefined || val === '') return;
        hasData = true;
        const str = String(val).trim();
        const num = parseFloat(str);
        if (ct === 'name') item.name = str;
        else if (ct === 'currency') item.currency = /rmb|cny|위안|元/.test(str.toLowerCase()) ? 'CNY' : 'USD';
        else if (ct === 'fob' && !isNaN(num)) item.fobPrice = num;
        else if (ct === 'size') { const sz = parseSize(str); if (sz) [item.boxL, item.boxW, item.boxH] = sz; }
        else if (ct === 'sizeL' && !isNaN(num)) sizeL = num;
        else if (ct === 'sizeW' && !isNaN(num)) sizeW = num;
        else if (ct === 'sizeH' && !isNaN(num)) sizeH = num;
        else if (ct === 'qtyPerBox' && !isNaN(num)) item.qtyPerBox = num || 1;
        else if (ct === 'weightG' && !isNaN(num)) item.weightG = num;
        else if (ct === 'selling' && !isNaN(num)) item.sellingPrice = num;
        else if (ct === 'note') item.note = str;
      });
      if (sizeL > 0) { item.boxL = sizeL; item.boxW = sizeW; item.boxH = sizeH; }
      if (!item.currency) item.currency = defaultCurrency;
      if (hasData && (item.name || item.fobPrice > 0)) items.push(item);
    }
    onImport(items);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="font-semibold text-sm">파일에서 제품 가져오기</span>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {step === 'upload' && (
            <>
              <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 cursor-pointer hover:bg-muted/30 transition-colors">
                <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                <div className="text-sm font-medium">Excel(.xlsx, .xls) 파일을 클릭하거나 드래그하세요</div>
                <div className="text-xs text-muted-foreground mt-1">공급사 원가시트, 견적서 등 — 병합 셀 포함 지원</div>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
              {loading && <div className="text-center py-4 text-muted-foreground text-sm">파일 읽는 중...</div>}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <div className="font-medium">읽기 실패: {error}</div>
                </div>
              )}
            </>
          )}

          {step === 'select' && currentSheet && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                {sheetNames.length > 1 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">시트:</span>
                    {sheetNames.map((name, i) => (
                      <button key={i} onClick={() => changeSheet(i)}
                        className={cn('px-2 py-1 rounded border text-xs', i === selectedSheetIdx ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs ml-auto">
                  <span className="text-muted-foreground">기본 통화:</span>
                  <select className="border rounded px-1.5 py-1 text-xs" value={defaultCurrency}
                    onChange={e => setDefaultCurrency(e.target.value as 'USD' | 'CNY')}>
                    <option value="USD">USD</option>
                    <option value="CNY">RMB/CNY</option>
                  </select>
                </div>
                <button className="text-xs text-muted-foreground underline"
                  onClick={() => { setStep('upload'); setSheets([]); }}>다른 파일</button>
              </div>

              <div className="text-xs bg-blue-50 border border-blue-200 rounded px-3 py-2 text-blue-800">
                <strong>① 헤더 행 클릭</strong> → 컬럼 자동 감지 &nbsp;→&nbsp;
                <strong>② 드롭다운</strong>으로 항목 확인/수정 &nbsp;→&nbsp;
                <strong>③ 가져오기</strong> 클릭
                {headerRowIdx !== null && <span className="ml-2 text-green-700 font-medium">✓ {headerRowIdx + 1}행 선택 → {headerRowIdx + 2}행부터 가져옵니다</span>}
              </div>

              {headerRowIdx !== null && (
                <div className="border rounded-lg overflow-auto max-h-12 bg-amber-50/50">
                  <table className="text-[10px] w-max">
                    <tbody>
                      <tr>
                        <td className="px-2 py-1 text-muted-foreground border-r w-10">컬럼</td>
                        {colTypes.map((ct, ci) => (
                          <td key={ci} className="px-1 py-1 border-r min-w-[100px]">
                            <select className="text-[10px] border rounded px-1 w-full"
                              value={ct} onChange={e => setColTypes(prev => { const n = [...prev]; n[ci] = e.target.value; return n; })}>
                              {COL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border rounded-lg overflow-auto" style={{ maxHeight: '55vh' }}>
                <table className="text-[10px] border-collapse w-max">
                  <thead className="sticky top-0 z-10 bg-muted/80">
                    <tr>
                      <th className="border px-1 py-1 w-8 text-muted-foreground font-normal sticky left-0 bg-muted/80">#</th>
                      {Array.from({ length: currentSheet.maxCols }, (_, ci) => (
                        <th key={ci} className="border px-2 py-1 font-normal text-muted-foreground min-w-[80px]">
                          {headerRowIdx !== null ? (
                            <span className={cn('text-[9px] font-bold', colTypes[ci] !== 'ignore' ? 'text-primary' : '')}>
                              {COL_TYPE_OPTIONS.find(o => o.value === (colTypes[ci] || 'ignore'))?.label}
                            </span>
                          ) : String.fromCharCode(65 + ci)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentSheet.rows.map((row, ri) => {
                      const isHeader = ri === headerRowIdx;
                      const isData = headerRowIdx !== null && ri > headerRowIdx;
                      return (
                        <tr key={ri} onClick={() => selectHeaderRow(ri)}
                          className={cn('border-b cursor-pointer transition-colors',
                            isHeader ? 'bg-amber-100 hover:bg-amber-200' : '',
                            isData ? 'hover:bg-blue-50/50' : 'hover:bg-muted/40',
                          )}>
                          <td className={cn('border px-1 py-0.5 text-muted-foreground text-[9px] sticky left-0', isHeader ? 'bg-amber-100' : 'bg-background')}>
                            {ri + 1}
                          </td>
                          {Array.from({ length: currentSheet.maxCols }, (_, ci) => {
                            const val = row[ci];
                            const ct = colTypes[ci];
                            return (
                              <td key={ci} className={cn('border px-2 py-0.5 truncate max-w-[150px]',
                                isHeader ? 'font-bold text-amber-900' : '',
                                ct && ct !== 'ignore' && isData ? 'bg-blue-50/30' : '',
                              )}>
                                {val !== null && val !== undefined ? String(val) : ''}
                              </td>
                            );
                          })}
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
              ? `${currentSheet.rows.slice(headerRowIdx + 1).filter(r => r.some(v => v !== null && v !== '')).length}개 제품 가져오기`
              : '헤더 행을 클릭해 선택하세요'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 숫자 입력 헬퍼 ─────────────────────────────────────────────────────────────
function NumInput({
  value, onChange, className = '', step = 1, placeholder = '',
  min,
}: {
  value: number | undefined; onChange: (v: number) => void;
  className?: string; step?: number; placeholder?: string; min?: number;
}) {
  return (
    <input
      type="number" step={step} min={min}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={cn('border rounded text-right', className)}
    />
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function EstimatorPage() {
  const [cases, setCases] = useState<EstimatorCase[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EstimatorCase | null>(null);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [showNewCase, setShowNewCase] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/estimator').then(r => r.json()).then(d => {
      const list = d.data || [];
      setCases(list);
      if (list.length > 0) { setActiveId(list[0].id); setDraft(list[0]); }
    });
  }, []);

  const saveDraft = useCallback((next: EstimatorCase) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await fetch(`/api/estimator/${next.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      setSaving(false);
    }, 800);
  }, []);

  const createCase = async () => {
    const name = newCaseName.trim() || '새 케이스';
    const res = await fetch('/api/estimator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setCases(prev => [data.data, ...prev]);
    setActiveId(data.data.id);
    setDraft(data.data);
    setShowNewCase(false);
    setNewCaseName('');
  };

  const deleteCase = async (id: string) => {
    if (!confirm('케이스를 삭제할까요?')) return;
    await fetch(`/api/estimator/${id}`, { method: 'DELETE' });
    const next = cases.filter(c => c.id !== id);
    setCases(next);
    if (activeId === id) { setActiveId(next[0]?.id || null); setDraft(next[0] || null); }
  };

  const switchCase = (c: EstimatorCase) => { setActiveId(c.id); setDraft(c); };

  const updateField = <K extends keyof EstimatorCase>(key: K, val: EstimatorCase[K]) => {
    if (!draft) return;
    saveDraft({ ...draft, [key]: val });
  };

  const addItem = () => { if (!draft) return; saveDraft({ ...draft, items: [...draft.items, newItem()] }); };

  const updateItem = (idx: number, patch: Partial<EstimatorItem>) => {
    if (!draft) return;
    saveDraft({ ...draft, items: draft.items.map((it, i) => i === idx ? { ...it, ...patch } : it) });
  };

  const removeItem = (idx: number) => {
    if (!draft) return;
    saveDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) });
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

  // 공통 입력 스타일
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
            <Button onClick={createCase}>만들기</Button>
          </div>
        )}
      </div>
    </div>
  );

  const c = draft;
  const seaUsd = getSeaUsd(c);
  const seaKrw = getSeaKrw(c);
  const totalFreightKrw = getTotalFreightKrw(c);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="원가계산기" />
      <div className="flex flex-1 overflow-hidden">

        {/* ── 케이스 목록 사이드바 ─────────────────────────────────── */}
        <div className="w-44 shrink-0 border-r flex flex-col bg-muted/20">
          <div className="px-2 py-2 border-b flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">케이스</span>
            <button onClick={() => setShowNewCase(!showNewCase)} className="text-primary hover:text-primary/80">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {showNewCase && (
            <div className="p-2 border-b">
              <Input value={newCaseName} onChange={e => setNewCaseName(e.target.value)} placeholder="케이스명"
                className="h-7 text-xs mb-1" autoFocus
                onKeyDown={e => { if (e.key === 'Enter') createCase(); if (e.key === 'Escape') setShowNewCase(false); }} />
              <Button size="sm" className="w-full h-6 text-xs" onClick={createCase}>만들기</Button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {cases.map(cc => (
              <div key={cc.id} onClick={() => switchCase(cc)}
                className={cn('px-2 py-2 cursor-pointer border-b text-xs group flex items-start justify-between gap-1',
                  activeId === cc.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50')}>
                <div className="truncate flex-1">{cc.name}</div>
                <button onClick={e => { e.stopPropagation(); deleteCase(cc.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── 메인 영역 ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── 설정 패널 ──────────────────────────────────────────── */}
          <div className="border-b px-4 py-3 bg-background shrink-0 space-y-3">

            {/* 1행: 케이스명 / 컨테이너 / 모드 */}
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">케이스명</div>
                <div className="flex items-center gap-2">
                  <Input value={c.name} onChange={e => updateField('name', e.target.value)}
                    className="h-7 text-xs font-semibold w-40" />
                  {saving && <span className="text-[10px] text-muted-foreground">저장 중...</span>}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">컨테이너</div>
                <select className="h-7 border rounded text-xs px-2" value={c.containerType}
                  onChange={e => updateField('containerType', e.target.value as EstimatorCase['containerType'])}>
                  {(['20ft', '40ft', '40HQ'] as const).map(t =>
                    <option key={t} value={t}>{t} ({CONTAINER_CBM[t]}CBM)</option>)}
                </select>
              </div>
              <div className="ml-auto">
                <div className="text-[10px] text-muted-foreground mb-0.5">시뮬레이션 모드</div>
                <div className="flex gap-1">
                  {([
                    ['standard', '표준계산', 'FOB→DDP 원가 산출'],
                    ['reverse', '판매가역산', '목표이익률 → 판매가 계산'],
                    ['mixed', '혼적', '여러 제품을 한 컨테이너에 혼적'],
                  ] as const).map(([mode, label, desc]) => (
                    <button key={mode} onClick={() => updateField('simMode', mode)}
                      title={desc}
                      className={cn('px-2.5 py-1 rounded text-xs border transition-colors',
                        c.simMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2행: 운임 | 환율 | 관세·EPR */}
            <div className="grid grid-cols-3 gap-5 border-t pt-2.5">

              {/* 운임 */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">운임</div>
                <div className="space-y-1.5">
                  {/* 해상운임 (USD) */}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-10">해상</span>
                      <input type="number" step="10" value={seaUsd || ''}
                        placeholder="0"
                        onChange={e => updateField('freightSeaUsd', parseFloat(e.target.value) || 0)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">USD</span>
                      <span className="text-[10px] text-muted-foreground/60">≈ {seaKrw.toLocaleString()}원</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 ml-10">💡 해상운임은 USD 견적 기준</div>
                  </div>
                  {/* 내륙 / 포트 / 기타 (KRW) */}
                  {([
                    ['freightInland', '내륙'] as const,
                    ['freightPort', '포트'] as const,
                    ['freightMisc', '기타'] as const,
                  ]).map(([k, label]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-10">{label}</span>
                      <input type="number" step="10000" value={c[k] || ''}
                        placeholder="0"
                        onChange={e => updateField(k, parseInt(e.target.value) || 0)}
                        className="h-6 border rounded text-[10px] px-1.5 w-24 text-right" />
                      <span className="text-[10px] text-muted-foreground">원</span>
                    </div>
                  ))}
                  <div className="text-[10px] text-muted-foreground border-t pt-1 mt-0.5">
                    합계: <strong className="text-foreground">{totalFreightKrw.toLocaleString()}원</strong>
                    <span className="text-muted-foreground/60 ml-1">(≈ ${Math.round(totalFreightKrw / (c.fxUsd || 1430)).toLocaleString()})</span>
                  </div>
                </div>
              </div>

              {/* 환율 */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">환율 (계산 적용)</div>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-16">USD/KRW</span>
                      <input type="number" step="10" value={c.fxUsd || ''}
                        onChange={e => updateField('fxUsd', parseInt(e.target.value) || 1430)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">원</span>
                    </div>
                    <div className="flex gap-1 mt-1 ml-16">
                      {[[-50, '공격적'], [0, '중립'], [50, '보수적+50'], [100, '보수적+100']].map(([delta, label]) => (
                        <button key={label} title={String(label)}
                          onClick={() => {
                            const base = 1390;
                            updateField('fxUsd', base + (delta as number));
                          }}
                          className="text-[9px] px-1 py-0.5 border rounded hover:bg-muted text-muted-foreground">
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">💡 최근 시세 약 1,370~1,420원 · 보수적 적용 권장</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground w-16">RMB/KRW</span>
                      <input type="number" step="5" value={c.fxRmb || ''}
                        onChange={e => updateField('fxRmb', parseInt(e.target.value) || 195)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">원</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">💡 최근 시세 약 188~200원</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground pt-0.5 border-t">
                    1 USD = {((c.fxUsd || 1430) / (c.fxRmb || 195)).toFixed(3)} RMB (적용환율 기준)
                  </div>
                </div>
              </div>

              {/* 관세 / EPR */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">관세 / 환경분담금(EPR)</div>
                <div className="space-y-2.5">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">
                      기본 관세율 <span className="text-muted-foreground/60">(품목별 개별 설정 가능)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" step="0.1" value={(c.dutyRate * 100).toFixed(1)}
                        onChange={e => updateField('dutyRate', parseFloat(e.target.value) / 100 || 0)}
                        className="h-6 border rounded text-[10px] px-1.5 w-16 text-right" />
                      <span className="text-[10px] text-muted-foreground">%</span>
                      <span className="text-[10px] text-muted-foreground/50">(CIF 기준 과세)</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">EPR 환경분담금 단가</div>
                    <div className="flex items-center gap-1.5">
                      <input type="number" step="1" min="0" value={c.eprRate || ''}
                        placeholder="0"
                        onChange={e => updateField('eprRate', parseFloat(e.target.value) || 0)}
                        className="h-6 border rounded text-[10px] px-1.5 w-20 text-right" />
                      <span className="text-[10px] text-muted-foreground">원/kg</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 space-y-0.5">
                      <div>💡 LED조명: ~32원/kg · 형광램프: ~63원/kg</div>
                      <div>💡 모니터: ~25원/kg · PC·노트북: ~22원/kg</div>
                      <div>제품별 EPR 소재 중량(g)을 표에서 입력</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 툴바 ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
            {c.simMode === 'mixed' && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                혼적 모드: 각 제품이 담당할 CBM을 직접 입력하세요 (합계 {CONTAINER_CBM[c.containerType]}CBM 이하)
              </div>
            )}
            {c.simMode === 'reverse' && (
              <div className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1">
                역산 모드: 목표 이익률 입력 → 판매가 자동 계산
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

          {/* ── 계산 테이블 ──────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto">
            <table className="text-xs border-collapse w-max min-w-full">
              <thead className="bg-muted/70 sticky top-0 z-10">
                <tr>
                  {/* 입력 컬럼 */}
                  <th className="border px-2 py-1.5 text-left font-medium min-w-[150px] sticky left-0 bg-muted/70 z-20">제품명</th>
                  <th className="border px-2 py-1.5 font-medium w-14">통화</th>
                  <th className="border px-2 py-1.5 font-medium w-20">FOB가</th>
                  <th className="border px-2 py-1.5 font-medium w-32">박스 L×W×H(cm)</th>
                  <th className="border px-2 py-1.5 font-medium w-14">입수</th>
                  <th className="border px-2 py-1.5 font-medium w-16" title="단품 무게(g/pcs)">단중(g)</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-green-50/50" title="EPR 환경분담금 부과 대상 소재 중량(g/pcs). PC·플라스틱 등">EPR소재(g)</th>
                  {c.simMode === 'mixed' && <th className="border px-2 py-1.5 font-medium w-16 bg-blue-50">CBM할당</th>}
                  <th className="border px-2 py-1.5 font-medium w-16" title="개별 관세율. 비워두면 기본값 사용">관세율</th>
                  {c.simMode !== 'reverse'
                    ? <th className="border px-2 py-1.5 font-medium w-20">판매가(USD)</th>
                    : <th className="border px-2 py-1.5 font-medium w-20 bg-purple-50">목표이익률</th>
                  }
                  {/* 계산 결과 */}
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50/70" title="FOB 가격을 USD로 환산 (CNY 입력 시)">FOB USD</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50/70">CBM/박스</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-sky-50/70">적재수</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-sky-50/70" title="CIF = FOB + 해상운임/개 (관세 과세 기준)">CIF(USD)</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50/70">관세/개</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-sky-50/70" title="내륙운송+포트차지+기타 (원화)">내륙+포트</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-green-50/70" title="EPR 환경분담금 (원/개)">EPR/개(원)</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-green-50">DDP(USD)</th>
                  <th className="border px-2 py-1.5 font-medium w-22 bg-green-50">DDP(KRW)</th>
                  <th className="border px-2 py-1.5 font-medium w-20 bg-amber-50">판매가(USD)</th>
                  <th className="border px-2 py-1.5 font-medium w-22 bg-amber-50">판매가(KRW)</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-amber-50">이익(USD)</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-amber-50">이익률</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-amber-50" title="총 물류비 / 판매가">물류비%</th>
                  <th className="border px-1 py-1.5 w-14 sticky right-0 bg-muted/70"></th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((item, idx) => {
                  const r = calcItem(item, c);
                  const marginColor = r.marginPct !== undefined
                    ? (r.marginPct >= 0.15 ? 'text-green-700' : r.marginPct >= 0.08 ? 'text-amber-700' : 'text-red-600')
                    : '';

                  return (
                    <tr key={item.id} className="border-b hover:bg-muted/20">
                      {/* 제품명 */}
                      <td className="border px-1 py-1 sticky left-0 bg-background">
                        <input value={item.name}
                          onChange={e => updateItem(idx, { name: e.target.value })}
                          placeholder="제품명"
                          className={cn(inCls, 'min-w-[140px]')} />
                      </td>
                      {/* 통화 */}
                      <td className="border px-1 py-1">
                        <select value={item.currency}
                          onChange={e => updateItem(idx, { currency: e.target.value as 'USD' | 'CNY' })}
                          className="h-7 border-0 rounded text-xs w-full">
                          <option value="USD">USD</option>
                          <option value="CNY">RMB</option>
                        </select>
                      </td>
                      {/* FOB 가격 */}
                      <td className="border px-1 py-1">
                        <input type="number" step="0.01" value={item.fobPrice || ''}
                          onChange={e => updateItem(idx, { fobPrice: parseFloat(e.target.value) || 0 })}
                          className={cn(inCls, 'text-right')} placeholder="0.00" />
                      </td>
                      {/* 박스 사이즈 */}
                      <td className="border px-1 py-1">
                        <div className="flex gap-0.5 items-center">
                          {(['boxL', 'boxW', 'boxH'] as const).map((k, i) => (
                            <React.Fragment key={k}>
                              <input type="number" value={item[k] || ''}
                                onChange={e => updateItem(idx, { [k]: parseFloat(e.target.value) || 0 })}
                                className="h-7 border rounded text-[10px] px-1 w-14 text-right"
                                placeholder={['L', 'W', 'H'][i]} />
                              {i < 2 && <span className="text-muted-foreground text-[10px]">×</span>}
                            </React.Fragment>
                          ))}
                        </div>
                      </td>
                      {/* 입수 */}
                      <td className="border px-1 py-1">
                        <input type="number" value={item.qtyPerBox || ''}
                          onChange={e => updateItem(idx, { qtyPerBox: parseInt(e.target.value) || 1 })}
                          className={cn(inCls, 'text-right')} />
                      </td>
                      {/* 단중(g) */}
                      <td className="border px-1 py-1">
                        <input type="number" step="1" value={item.weightG || ''}
                          placeholder="g"
                          onChange={e => updateItem(idx, { weightG: parseFloat(e.target.value) || undefined })}
                          className={cn(inCls, 'text-right')} />
                      </td>
                      {/* EPR 소재 중량(g) */}
                      <td className="border px-1 py-1 bg-green-50/20">
                        <input type="number" step="1" value={item.eprWeightG || ''}
                          placeholder="g"
                          onChange={e => updateItem(idx, { eprWeightG: parseFloat(e.target.value) || undefined })}
                          className={cn(inCls, 'text-right bg-green-50/40')} />
                      </td>
                      {/* 혼적 CBM */}
                      {c.simMode === 'mixed' && (
                        <td className="border px-1 py-1 bg-blue-50/30">
                          <input type="number" step="0.1" value={item.mixedCbm || ''}
                            onChange={e => updateItem(idx, { mixedCbm: parseFloat(e.target.value) || 0 })}
                            className={cn(inCls, 'text-right bg-blue-50')} placeholder="CBM" />
                        </td>
                      )}
                      {/* 관세율 개별 */}
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
                      {/* 판매가 or 목표이익률 */}
                      {c.simMode !== 'reverse' ? (
                        <td className="border px-1 py-1">
                          <input type="number" step="0.01" value={item.sellingPrice || ''}
                            onChange={e => updateItem(idx, { sellingPrice: parseFloat(e.target.value) || undefined })}
                            className={cn(inCls, 'text-right')} placeholder="0.00" />
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

                      {/* ── 계산 결과 ── */}
                      <td className="border px-2 py-1 text-right bg-sky-50/30 text-muted-foreground">
                        {item.currency === 'CNY' ? fmtUsd(r.fobUsd) : '-'}
                      </td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 text-muted-foreground">
                        {r.cbmPerBox > 0 ? r.cbmPerBox.toFixed(4) : '-'}
                      </td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 font-medium">
                        {r.qtyPerContainer > 0 ? r.qtyPerContainer.toLocaleString() : '-'}
                      </td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 font-medium" title="FOB + 해상운임/개">
                        {fmtUsd(r.cifUsd)}
                      </td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30">
                        {fmtUsd(r.dutyPerUnitUsd)}
                        <div className="text-[9px] text-muted-foreground">{fmtPct(r.dutyRate)}</div>
                      </td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 text-muted-foreground">
                        {r.otherPerUnitKrw > 0 ? fmtKrw(r.otherPerUnitKrw) : '-'}
                      </td>
                      <td className="border px-2 py-1 text-right bg-green-50/30">
                        {r.eprPerUnitKrw > 0
                          ? <span className="text-emerald-700">{fmtKrw(r.eprPerUnitKrw)}</span>
                          : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="border px-2 py-1 text-right bg-green-50/50 font-bold text-green-800">
                        {fmtUsd(r.ddpUsd)}
                      </td>
                      <td className="border px-2 py-1 text-right bg-green-50/50 text-green-700">
                        {fmtKrw(r.ddpKrw)}
                      </td>
                      <td className="border px-2 py-1 text-right bg-amber-50/50 font-medium">
                        {r.sellingUsd !== undefined ? fmtUsd(r.sellingUsd) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="border px-2 py-1 text-right bg-amber-50/50">
                        {r.sellingKrw !== undefined ? fmtKrw(r.sellingKrw) : '-'}
                      </td>
                      <td className={cn('border px-2 py-1 text-right bg-amber-50/50',
                        r.profitUsd !== undefined && r.profitUsd < 0 ? 'text-red-600' : 'text-green-700')}>
                        {r.profitUsd !== undefined ? fmtUsd(r.profitUsd) : '-'}
                      </td>
                      <td className={cn('border px-2 py-1 text-right bg-amber-50/50 font-bold', marginColor)}>
                        {fmtPct(r.marginPct)}
                      </td>
                      <td className="border px-2 py-1 text-right bg-amber-50/50 text-[10px] text-muted-foreground">
                        {r.freightRatio !== undefined ? fmtPct(r.freightRatio) : '-'}
                      </td>
                      {/* 액션 */}
                      <td className="border px-1 py-1 sticky right-0 bg-background">
                        <div className="flex gap-1">
                          <button onClick={() => duplicateItem(idx)}
                            className="text-muted-foreground hover:text-primary p-0.5" title="복사">
                            <Copy className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeItem(idx)}
                            className="text-muted-foreground hover:text-destructive p-0.5" title="삭제">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* 합계 행 */}
                {c.items.length > 1 && (
                  <tr className="bg-muted/50 font-semibold border-t-2">
                    <td className="border px-2 py-1.5 sticky left-0 bg-muted/50 text-xs" colSpan={2}>합계 / 평균</td>
                    <td colSpan={c.simMode === 'mixed' ? 9 : 8} className="border"></td>
                    {c.simMode === 'mixed' && (
                      <td className="border px-2 py-1.5 text-right text-xs bg-blue-50/50">
                        {c.items.reduce((s, it) => s + (it.mixedCbm || 0), 0).toFixed(1)} / {CONTAINER_CBM[c.containerType]} CBM
                      </td>
                    )}
                    <td colSpan={6} className="border"></td>
                    {/* EPR 합계 */}
                    <td className="border px-2 py-1.5 text-right text-xs bg-green-50/40 text-emerald-700">
                      {(() => {
                        const total = c.items.reduce((s, it) => s + calcItem(it, c).eprPerUnitKrw, 0);
                        return total > 0 ? fmtKrw(total / c.items.length) + '/개 평균' : '-';
                      })()}
                    </td>
                    <td colSpan={2} className="border"></td>
                    {/* 이익률 평균 */}
                    <td colSpan={2} className="border"></td>
                    <td className="border px-2 py-1.5 text-right text-xs bg-amber-50/60">
                      {fmtPct((() => {
                        const calcs = c.items.map(it => calcItem(it, c));
                        const valid = calcs.filter(r => r.profitUsd !== undefined && r.sellingUsd !== undefined);
                        if (!valid.length) return undefined;
                        const totalP = valid.reduce((s, r) => s + (r.profitUsd || 0), 0);
                        const totalS = valid.reduce((s, r) => s + (r.sellingUsd || 0), 0);
                        return totalS > 0 ? totalP / totalS : undefined;
                      })())}
                    </td>
                    <td colSpan={2} className="border sticky right-0 bg-muted/50"></td>
                  </tr>
                )}

                {c.items.length === 0 && (
                  <tr>
                    <td colSpan={24} className="text-center py-12 text-muted-foreground text-sm">
                      <div>제품을 추가하거나 파일에서 가져오세요</div>
                      <div className="flex gap-2 justify-center mt-3">
                        <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
                          <Upload className="w-3 h-3 mr-1" />파일 가져오기
                        </Button>
                        <Button size="sm" onClick={addItem}>
                          <Plus className="w-3 h-3 mr-1" />제품 추가
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 비고 */}
          <div className="border-t px-4 py-2 shrink-0">
            <textarea value={c.notes || ''} onChange={e => updateField('notes', e.target.value)}
              placeholder="비고 / 메모" rows={2}
              className="w-full text-xs border rounded px-2 py-1.5 resize-none text-muted-foreground focus:text-foreground" />
          </div>
        </div>
      </div>

      {showImport && <ImportDialog onImport={importItems} onClose={() => setShowImport(false)} />}
    </div>
  );
}
