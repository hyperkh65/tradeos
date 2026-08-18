'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Upload, ChevronDown, ChevronRight, Copy, RotateCcw, FileSpreadsheet, X, Check } from 'lucide-react';

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface EstimatorItem {
  id: string; name: string;
  currency: 'USD' | 'CNY';
  fobPrice: number;
  boxL: number; boxW: number; boxH: number;
  qtyPerBox: number;
  dutyRateOverride?: number;
  sellingPrice?: number;
  targetMargin?: number;
  mixedCbm?: number;  // 혼적: 이 아이템이 차지할 CBM
  note?: string;
}
interface EstimatorCase {
  id: string; name: string;
  containerType: '20ft' | '40ft' | '40HQ';
  freightSea: number; freightInland: number; freightPort: number; freightMisc: number;
  fxUsd: number; fxRmb: number;
  dutyRate: number;
  simMode: 'standard' | 'reverse' | 'mixed';
  items: EstimatorItem[];
  notes?: string;
  createdAt: string; updatedAt: string;
}

// ── 계산 상수 ──────────────────────────────────────────────────────────────────
const CONTAINER_CBM: Record<string, number> = { '20ft': 27, '40ft': 56, '40HQ': 68 };

// ── 계산 함수 ──────────────────────────────────────────────────────────────────
function calcItem(item: EstimatorItem, c: EstimatorCase) {
  const fxUsd = c.fxUsd || 1330;
  const fxRmb = c.fxRmb || 185;
  const containerCbm = CONTAINER_CBM[c.containerType] || 56;
  const totalFreightKrw = (c.freightSea || 0) + (c.freightInland || 0) + (c.freightPort || 0) + (c.freightMisc || 0);

  // FOB → USD
  const fobUsd = item.currency === 'CNY' ? item.fobPrice * (fxRmb / fxUsd) : item.fobPrice;

  // CBM
  const cbmPerBox = item.boxL > 0 && item.boxW > 0 && item.boxH > 0
    ? (item.boxL * item.boxW * item.boxH) / 1_000_000  // cm → m³
    : 0;

  // 적재수량 (풀 컨 기준 또는 혼적 지정 CBM)
  let qtyPerContainer = 0;
  if (c.simMode === 'mixed' && item.mixedCbm && item.mixedCbm > 0) {
    // 혼적: 지정한 CBM 비율로 계산
    const boxesInMixed = cbmPerBox > 0 ? Math.floor(item.mixedCbm / cbmPerBox) : 0;
    qtyPerContainer = boxesInMixed * item.qtyPerBox;
  } else {
    // 표준: 풀 컨 기준
    const boxesPerContainer = cbmPerBox > 0 ? Math.floor(containerCbm / cbmPerBox) : 0;
    qtyPerContainer = boxesPerContainer * item.qtyPerBox;
  }

  // 운임/개
  const freightPerUnit = qtyPerContainer > 0 ? totalFreightKrw / qtyPerContainer / fxUsd : 0;

  // CIF
  const cifUsd = fobUsd + freightPerUnit;

  // 관세
  const duty = c.simMode !== 'reverse'
    ? (item.dutyRateOverride ?? c.dutyRate)
    : (item.dutyRateOverride ?? c.dutyRate);
  const dutyPerUnit = cifUsd * duty;

  // 내륙+포트/개 (already included in freightPerUnit above — split for display)
  const seaPerUnit = qtyPerContainer > 0 ? (c.freightSea || 0) / qtyPerContainer / fxUsd : 0;
  const inlandPerUnit = qtyPerContainer > 0 ? (c.freightInland || 0) / qtyPerContainer / fxUsd : 0;
  const portPerUnit = qtyPerContainer > 0 ? (c.freightPort || 0) / qtyPerContainer / fxUsd : 0;
  const miscPerUnit = qtyPerContainer > 0 ? (c.freightMisc || 0) / qtyPerContainer / fxUsd : 0;

  // DDP
  const ddpUsd = cifUsd + dutyPerUnit + inlandPerUnit + portPerUnit + miscPerUnit;
  const ddpKrw = ddpUsd * fxUsd;

  // 판매가 / 이익
  let sellingUsd: number | undefined;
  let profitUsd: number | undefined;
  let marginPct: number | undefined;

  if (c.simMode === 'reverse' && item.targetMargin !== undefined) {
    // 판매가 역산: DDP / (1 - target_margin)
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
  const freightRatio = sellingUsd && sellingUsd > 0 ? freightPerUnit / sellingUsd : undefined;

  return {
    fobUsd, cbmPerBox, qtyPerContainer,
    seaPerUnit, inlandPerUnit, portPerUnit, miscPerUnit, freightPerUnit,
    cifUsd, dutyPerUnit, ddpUsd, ddpKrw,
    sellingUsd, sellingKrw, profitUsd, marginPct, freightRatio,
    dutyRate: item.dutyRateOverride ?? c.dutyRate,
  };
}

function fmtUsd(n?: number) {
  if (n === undefined || isNaN(n)) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtKrw(n?: number) {
  if (n === undefined || isNaN(n)) return '-';
  return Math.round(n).toLocaleString() + '원';
}
function fmtPct(n?: number) {
  if (n === undefined || isNaN(n)) return '-';
  return (n * 100).toFixed(1) + '%';
}
function fmtNum(n?: number, digits = 3) {
  if (n === undefined || isNaN(n)) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
  { value: 'size', label: '박스사이즈 (LxWxH)' },
  { value: 'sizeL', label: '박스 L(cm)' },
  { value: 'sizeW', label: '박스 W(cm)' },
  { value: 'sizeH', label: '박스 H(cm)' },
  { value: 'qtyPerBox', label: '입수(/박스)' },
  { value: 'selling', label: '판매가' },
  { value: 'note', label: '비고' },
];

function parseSize(s: string): [number, number, number] | null {
  const m = String(s).match(/(\d+\.?\d*)[×xX*\s]+(\d+\.?\d*)[×xX*\s]+(\d+\.?\d*)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  return null;
}

function ImportDialog({ onImport, onClose }: { onImport: (items: EstimatorItem[]) => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ sheetNames: string[]; rows: (string | number | null)[][]; colTypes: string[] } | null>(null);
  const [colTypes, setColTypes] = useState<string[]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [dataStartRow, setDataStartRow] = useState(1);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [fileData, setFileData] = useState<File | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState<'USD' | 'CNY'>('USD');

  const handleFile = async (file: File) => {
    setFileData(file);
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sheetIdx', '0');
    const res = await fetch('/api/estimator/parse-file', { method: 'POST', body: fd });
    const data = await res.json();
    setPreview(data);
    setColTypes(data.colTypes || []);
    setLoading(false);
  };

  const handleSheetChange = async (idx: number) => {
    if (!fileData) return;
    setSelectedSheet(idx);
    setLoading(true);
    const fd = new FormData();
    fd.append('file', fileData);
    fd.append('sheetIdx', String(idx));
    const res = await fetch('/api/estimator/parse-file', { method: 'POST', body: fd });
    const data = await res.json();
    setPreview(data);
    setColTypes(data.colTypes || []);
    setLoading(false);
  };

  const doImport = () => {
    if (!preview) return;
    const items: EstimatorItem[] = [];
    for (let ri = dataStartRow; ri < preview.rows.length; ri++) {
      const row = preview.rows[ri];
      const item: EstimatorItem = { ...newItem() };
      let hasData = false;
      let sizeL = 0, sizeW = 0, sizeH = 0;

      colTypes.forEach((ct, ci) => {
        const val = row[ci];
        if (val === null || val === undefined || val === '') return;
        hasData = true;
        if (ct === 'name') item.name = String(val);
        else if (ct === 'currency') item.currency = String(val).toUpperCase().includes('RMB') || String(val).toUpperCase().includes('CNY') ? 'CNY' : 'USD';
        else if (ct === 'fob') item.fobPrice = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
        else if (ct === 'size') { const sz = parseSize(String(val)); if (sz) { [item.boxL, item.boxW, item.boxH] = sz; } }
        else if (ct === 'sizeL') sizeL = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
        else if (ct === 'sizeW') sizeW = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
        else if (ct === 'sizeH') sizeH = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
        else if (ct === 'qtyPerBox') item.qtyPerBox = typeof val === 'number' ? val : parseFloat(String(val)) || 1;
        else if (ct === 'selling') item.sellingPrice = typeof val === 'number' ? val : parseFloat(String(val)) || undefined;
        else if (ct === 'note') item.note = String(val);
      });

      if (sizeL > 0) { item.boxL = sizeL; item.boxW = sizeW; item.boxH = sizeH; }
      if (!item.currency) item.currency = defaultCurrency;
      if (hasData && (item.name || item.fobPrice > 0)) items.push(item);
    }
    onImport(items);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <div className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /><span className="font-semibold text-sm">파일에서 제품 가져오기</span></div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* 파일 드롭 */}
          {!preview && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 cursor-pointer hover:bg-muted/30 transition-colors">
              <Upload className="w-10 h-10 text-muted-foreground mb-3" />
              <div className="text-sm font-medium">Excel 파일(.xlsx)을 클릭하거나 드래그하세요</div>
              <div className="text-xs text-muted-foreground mt-1">공급사 원가시트, 견적서 등 지원</div>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          )}

          {loading && <div className="text-center py-8 text-muted-foreground text-sm">파일 분석 중...</div>}

          {preview && !loading && (
            <div className="space-y-4">
              {/* 시트 선택 */}
              {preview.sheetNames.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground font-medium">시트 선택:</span>
                  {preview.sheetNames.map((name, i) => (
                    <button key={i} onClick={() => handleSheetChange(i)}
                      className={cn('text-xs px-2 py-1 rounded border', i === selectedSheet ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>
                      {name}
                    </button>
                  ))}
                </div>
              )}

              {/* 설정 */}
              <div className="flex gap-4 flex-wrap items-center text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">헤더 행:</span>
                  <select className="border rounded px-1.5 py-1" value={headerRow} onChange={e => { setHeaderRow(+e.target.value); setDataStartRow(+e.target.value + 1); }}>
                    {preview.rows.slice(0, 10).map((_, i) => <option key={i} value={i}>{i + 1}행</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">데이터 시작:</span>
                  <select className="border rounded px-1.5 py-1" value={dataStartRow} onChange={e => setDataStartRow(+e.target.value)}>
                    {preview.rows.slice(0, 20).map((_, i) => <option key={i} value={i}>{i + 1}행</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">기본 통화:</span>
                  <select className="border rounded px-1.5 py-1" value={defaultCurrency} onChange={e => setDefaultCurrency(e.target.value as 'USD' | 'CNY')}>
                    <option value="USD">USD</option>
                    <option value="CNY">RMB/CNY</option>
                  </select>
                </div>
                <button className="text-xs text-muted-foreground underline" onClick={() => { setPreview(null); setFileData(null); }}>다른 파일</button>
              </div>

              {/* 컬럼 매핑 + 미리보기 */}
              <div className="border rounded-lg overflow-auto max-h-72">
                <table className="text-xs w-max min-w-full">
                  <thead className="bg-muted/60 sticky top-0 z-10">
                    <tr>
                      <td className="px-2 py-1 text-muted-foreground w-8">#</td>
                      {colTypes.map((ct, ci) => (
                        <td key={ci} className="px-1 py-1 min-w-[100px]">
                          <select className="text-[10px] border rounded px-1 w-full"
                            value={ct} onChange={e => setColTypes(prev => { const next = [...prev]; next[ci] = e.target.value; return next; })}>
                            {COL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-amber-50">
                      <td className="px-2 py-1 text-[10px] text-muted-foreground">{headerRow + 1}</td>
                      {(preview.rows[headerRow] || []).map((v, ci) => (
                        <td key={ci} className="px-2 py-1 text-[10px] font-medium text-amber-800 truncate max-w-[120px]">{String(v ?? '')}</td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(dataStartRow, dataStartRow + 15).map((row, ri) => (
                      <tr key={ri} className={cn('border-t', ri % 2 === 0 ? '' : 'bg-muted/20')}>
                        <td className="px-2 py-1 text-[10px] text-muted-foreground">{dataStartRow + ri + 1}</td>
                        {row.map((v, ci) => (
                          <td key={ci} className={cn('px-2 py-1 text-[10px] truncate max-w-[120px]', colTypes[ci] === 'ignore' ? 'text-muted-foreground/40' : '')}>{String(v ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded px-3 py-2">
                💡 <strong>박스 사이즈</strong>: 하나의 컬럼에 "670×670×30" 형식이면 "박스사이즈(LxWxH)" 선택. 분리된 컬럼이면 각각 L/W/H 선택.<br />
                FOB 가격이 RMB면 통화 컬럼을 "통화"로 매핑하거나, 위에서 기본 통화를 RMB로 설정하세요.
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-3.5 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">취소</Button>
          <Button onClick={doImport} disabled={!preview} className="flex-1">
            <Check className="w-3.5 h-3.5 mr-1" />가져오기
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
  const [showImport, setShowImport] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [showNewCase, setShowNewCase] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeCase = draft;

  useEffect(() => {
    fetch('/api/estimator').then(r => r.json()).then(d => {
      setCases(d.data || []);
      if (d.data?.length > 0) { setActiveId(d.data[0].id); setDraft(d.data[0]); }
    });
  }, []);

  const saveDraft = useCallback((next: EstimatorCase) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await fetch(`/api/estimator/${next.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      setSaving(false);
    }, 800);
  }, []);

  const createCase = async () => {
    const name = newCaseName.trim() || '새 케이스';
    const res = await fetch('/api/estimator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
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

  const addItem = () => {
    if (!draft) return;
    saveDraft({ ...draft, items: [...draft.items, newItem()] });
  };

  const updateItem = (idx: number, patch: Partial<EstimatorItem>) => {
    if (!draft) return;
    const items = draft.items.map((it, i) => i === idx ? { ...it, ...patch } : it);
    saveDraft({ ...draft, items });
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

  const inputCls = 'h-7 text-xs px-1.5 w-full';

  if (!activeCase) return (
    <div className="flex flex-col h-full">
      <AppHeader title="원가계산기" />
      <div className="flex-1 flex items-center justify-center flex-col gap-4">
        <div className="text-muted-foreground text-sm">케이스가 없습니다</div>
        <Button onClick={() => setShowNewCase(true)}><Plus className="w-3.5 h-3.5 mr-1" />새 케이스 만들기</Button>
        {showNewCase && (
          <div className="flex gap-2 mt-2">
            <Input value={newCaseName} onChange={e => setNewCaseName(e.target.value)} placeholder="케이스명" className="h-9 w-48" autoFocus onKeyDown={e => e.key === 'Enter' && createCase()} />
            <Button onClick={createCase}>만들기</Button>
          </div>
        )}
      </div>
    </div>
  );

  const c = activeCase;

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
              <Input value={newCaseName} onChange={e => setNewCaseName(e.target.value)} placeholder="케이스명" className="h-7 text-xs mb-1" autoFocus onKeyDown={e => { if (e.key === 'Enter') createCase(); if (e.key === 'Escape') setShowNewCase(false); }} />
              <Button size="sm" className="w-full h-6 text-xs" onClick={createCase}>만들기</Button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {cases.map(c => (
              <div key={c.id} onClick={() => switchCase(c)}
                className={cn('px-2 py-2 cursor-pointer border-b text-xs group flex items-start justify-between gap-1', activeId === c.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50')}>
                <div className="truncate flex-1">{c.name}</div>
                <button onClick={e => { e.stopPropagation(); deleteCase(c.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── 메인 영역 ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── 설정 패널 ──────────────────────────────────────────── */}
          <div className="border-b px-4 py-3 bg-background shrink-0">
            <div className="flex items-start gap-6 flex-wrap">

              {/* 케이스명 + 저장상태 */}
              <div className="min-w-[140px]">
                <div className="text-[10px] text-muted-foreground mb-1">케이스명</div>
                <Input value={c.name} onChange={e => updateField('name', e.target.value)} className="h-7 text-xs font-semibold" />
                {saving && <div className="text-[10px] text-muted-foreground mt-0.5">저장 중...</div>}
              </div>

              {/* 컨테이너 */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">컨테이너</div>
                <select className="h-7 border rounded text-xs px-2" value={c.containerType} onChange={e => updateField('containerType', e.target.value as EstimatorCase['containerType'])}>
                  {(['20ft', '40ft', '40HQ'] as const).map(t => <option key={t} value={t}>{t} ({CONTAINER_CBM[t]}CBM)</option>)}
                </select>
              </div>

              {/* 운임 */}
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground font-medium">운임 (원화)</div>
                <div className="grid grid-cols-4 gap-1 text-[10px]">
                  {([['freightSea', '해상운임'], ['freightInland', '내륙운송'], ['freightPort', '포트차지'], ['freightMisc', '기타']] as const).map(([k, label]) => (
                    <div key={k}>
                      <div className="text-muted-foreground mb-0.5">{label}</div>
                      <input type="number" value={c[k]} onChange={e => updateField(k, parseInt(e.target.value) || 0)}
                        className="h-7 border rounded text-xs px-1.5 w-24 text-right" />
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  운임합계: <strong>{((c.freightSea || 0) + (c.freightInland || 0) + (c.freightPort || 0) + (c.freightMisc || 0)).toLocaleString()}원</strong>
                </div>
              </div>

              {/* 환율 */}
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground font-medium">환율</div>
                <div className="flex gap-2 text-[10px]">
                  <div>
                    <div className="text-muted-foreground mb-0.5">USD/KRW</div>
                    <input type="number" value={c.fxUsd} onChange={e => updateField('fxUsd', parseInt(e.target.value) || 1330)}
                      className="h-7 border rounded text-xs px-1.5 w-20 text-right" />
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">RMB/KRW</div>
                    <input type="number" value={c.fxRmb} onChange={e => updateField('fxRmb', parseInt(e.target.value) || 185)}
                      className="h-7 border rounded text-xs px-1.5 w-20 text-right" />
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">1 USD ≈ {(c.fxUsd / c.fxRmb).toFixed(2)} RMB</div>
              </div>

              {/* 관세율 */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">기본 관세율</div>
                <div className="flex items-center gap-1">
                  <input type="number" step="0.1" value={(c.dutyRate * 100).toFixed(1)}
                    onChange={e => updateField('dutyRate', parseFloat(e.target.value) / 100 || 0)}
                    className="h-7 border rounded text-xs px-1.5 w-16 text-right" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>

              {/* 시뮬레이션 모드 */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">시뮬레이션 모드</div>
                <div className="flex gap-1">
                  {([['standard', '표준계산', 'FOB→DDP 산출'], ['reverse', '판매가역산', '목표이익률→판매가 산출'], ['mixed', '혼적', '여러 제품 한 컨테이너']] as const).map(([mode, label, desc]) => (
                    <button key={mode} onClick={() => updateField('simMode', mode)}
                      className={cn('px-2 py-1 rounded text-[10px] border transition-colors', c.simMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}
                      title={desc}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── 툴바 ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
            {c.simMode === 'mixed' && (
              <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 mr-2">
                혼적 모드: 각 제품이 담당할 CBM을 직접 입력하세요 (합계 {CONTAINER_CBM[c.containerType]}CBM 이하)
              </div>
            )}
            {c.simMode === 'reverse' && (
              <div className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1 mr-2">
                역산 모드: 목표 이익률을 입력하면 판매가를 자동 계산합니다
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
                  <th className="border px-2 py-1.5 text-left font-medium min-w-[160px] sticky left-0 bg-muted/70 z-20">제품명</th>
                  <th className="border px-2 py-1.5 font-medium w-14">통화</th>
                  <th className="border px-2 py-1.5 font-medium w-20">FOB가</th>
                  {c.simMode === 'standard' || c.simMode === 'reverse' ? null : null}
                  <th className="border px-2 py-1.5 font-medium w-28">박스 L×W×H (cm)</th>
                  <th className="border px-2 py-1.5 font-medium w-14">입수</th>
                  {c.simMode === 'mixed' && <th className="border px-2 py-1.5 font-medium w-16 bg-blue-50">CBM할당</th>}
                  <th className="border px-2 py-1.5 font-medium w-14">관세율</th>
                  {c.simMode !== 'reverse'
                    ? <th className="border px-2 py-1.5 font-medium w-20">판매가(USD)</th>
                    : <th className="border px-2 py-1.5 font-medium w-20 bg-purple-50">목표이익률</th>
                  }
                  {/* 계산 결과 */}
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50">FOB USD</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50">CBM/박스</th>
                  <th className="border px-2 py-1.5 font-medium w-18 bg-sky-50">컨 적재수</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50">운임/개</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50">CIF</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50">관세/개</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-sky-50">내륙+포트</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-green-50">DDP (USD)</th>
                  <th className="border px-2 py-1.5 font-medium w-20 bg-green-50">DDP (KRW)</th>
                  <th className="border px-2 py-1.5 font-medium w-20 bg-amber-50">판매가(USD)</th>
                  <th className="border px-2 py-1.5 font-medium w-20 bg-amber-50">판매가(KRW)</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-amber-50">이익(USD)</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-amber-50">이익률</th>
                  <th className="border px-2 py-1.5 font-medium w-16 bg-amber-50">물류비%</th>
                  <th className="border px-1 py-1.5 w-14 sticky right-0 bg-muted/70"></th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((item, idx) => {
                  const r = calcItem(item, c);
                  const marginColor = r.marginPct !== undefined ? (r.marginPct >= 0.15 ? 'text-green-700' : r.marginPct >= 0.08 ? 'text-amber-700' : 'text-red-600') : '';

                  return (
                    <tr key={item.id} className="border-b hover:bg-muted/20">
                      {/* 제품명 */}
                      <td className="border px-1 py-1 sticky left-0 bg-background">
                        <input value={item.name} onChange={e => updateItem(idx, { name: e.target.value })}
                          placeholder="제품명" className={cn(inputCls, 'min-w-[150px]')} />
                      </td>
                      {/* 통화 */}
                      <td className="border px-1 py-1">
                        <select value={item.currency} onChange={e => updateItem(idx, { currency: e.target.value as 'USD' | 'CNY' })}
                          className="h-7 border-0 rounded text-xs w-full">
                          <option value="USD">USD</option>
                          <option value="CNY">RMB</option>
                        </select>
                      </td>
                      {/* FOB 가격 */}
                      <td className="border px-1 py-1">
                        <input type="number" step="0.01" value={item.fobPrice || ''}
                          onChange={e => updateItem(idx, { fobPrice: parseFloat(e.target.value) || 0 })}
                          className={cn(inputCls, 'text-right')} placeholder="0.00" />
                      </td>
                      {/* 박스 사이즈 */}
                      <td className="border px-1 py-1">
                        <div className="flex gap-0.5 items-center">
                          {(['boxL', 'boxW', 'boxH'] as const).map((k, i) => (
                            <React.Fragment key={k}>
                              <input type="number" value={item[k] || ''}
                                onChange={e => updateItem(idx, { [k]: parseFloat(e.target.value) || 0 })}
                                className="h-7 border rounded text-[10px] px-1 w-16 text-right" placeholder={['L', 'W', 'H'][i]} />
                              {i < 2 && <span className="text-muted-foreground text-[10px]">×</span>}
                            </React.Fragment>
                          ))}
                        </div>
                      </td>
                      {/* 입수 */}
                      <td className="border px-1 py-1">
                        <input type="number" value={item.qtyPerBox || ''}
                          onChange={e => updateItem(idx, { qtyPerBox: parseInt(e.target.value) || 1 })}
                          className={cn(inputCls, 'text-right')} />
                      </td>
                      {/* 혼적 CBM */}
                      {c.simMode === 'mixed' && (
                        <td className="border px-1 py-1 bg-blue-50/30">
                          <input type="number" step="0.1" value={item.mixedCbm || ''}
                            onChange={e => updateItem(idx, { mixedCbm: parseFloat(e.target.value) || 0 })}
                            className={cn(inputCls, 'text-right bg-blue-50')} placeholder="CBM" />
                        </td>
                      )}
                      {/* 관세율 개별 */}
                      <td className="border px-1 py-1">
                        <div className="flex items-center gap-0.5">
                          <input type="number" step="0.1"
                            value={item.dutyRateOverride !== undefined ? (item.dutyRateOverride * 100).toFixed(1) : ''}
                            placeholder={`${(c.dutyRate * 100).toFixed(1)}`}
                            onChange={e => updateItem(idx, { dutyRateOverride: e.target.value ? parseFloat(e.target.value) / 100 : undefined })}
                            className={cn(inputCls, 'text-right w-12')} />
                          <span className="text-[10px] text-muted-foreground">%</span>
                        </div>
                      </td>
                      {/* 판매가 or 목표이익률 */}
                      {c.simMode !== 'reverse' ? (
                        <td className="border px-1 py-1">
                          <input type="number" step="0.01" value={item.sellingPrice || ''}
                            onChange={e => updateItem(idx, { sellingPrice: parseFloat(e.target.value) || undefined })}
                            className={cn(inputCls, 'text-right')} placeholder="0.00" />
                        </td>
                      ) : (
                        <td className="border px-1 py-1 bg-purple-50/30">
                          <div className="flex items-center gap-0.5">
                            <input type="number" step="0.1" value={item.targetMargin !== undefined ? (item.targetMargin * 100).toFixed(1) : ''}
                              onChange={e => updateItem(idx, { targetMargin: e.target.value ? parseFloat(e.target.value) / 100 : undefined })}
                              className={cn(inputCls, 'text-right w-14 bg-purple-50')} placeholder="15.0" />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                        </td>
                      )}

                      {/* ── 계산 결과 컬럼 ── */}
                      <td className="border px-2 py-1 text-right bg-sky-50/30">{item.currency === 'CNY' ? fmtUsd(r.fobUsd) : '-'}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 text-muted-foreground">{r.cbmPerBox > 0 ? r.cbmPerBox.toFixed(4) : '-'}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 font-medium">{r.qtyPerContainer > 0 ? r.qtyPerContainer.toLocaleString() : '-'}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30">{fmtUsd(r.freightPerUnit)}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30 font-medium">{fmtUsd(r.cifUsd)}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30">{fmtUsd(r.dutyPerUnit)}</td>
                      <td className="border px-2 py-1 text-right bg-sky-50/30">{fmtUsd((r.inlandPerUnit || 0) + (r.portPerUnit || 0))}</td>
                      <td className="border px-2 py-1 text-right bg-green-50/40 font-bold text-green-800">{fmtUsd(r.ddpUsd)}</td>
                      <td className="border px-2 py-1 text-right bg-green-50/40 text-green-700">{fmtKrw(r.ddpKrw)}</td>
                      <td className="border px-2 py-1 text-right bg-amber-50/40 font-medium">{r.sellingUsd !== undefined ? fmtUsd(r.sellingUsd) : <span className="text-muted-foreground">-</span>}</td>
                      <td className="border px-2 py-1 text-right bg-amber-50/40">{r.sellingKrw !== undefined ? fmtKrw(r.sellingKrw) : '-'}</td>
                      <td className={cn('border px-2 py-1 text-right bg-amber-50/40', r.profitUsd !== undefined && r.profitUsd < 0 ? 'text-red-600' : 'text-green-700')}>
                        {r.profitUsd !== undefined ? fmtUsd(r.profitUsd) : '-'}
                      </td>
                      <td className={cn('border px-2 py-1 text-right bg-amber-50/40 font-bold', marginColor)}>
                        {fmtPct(r.marginPct)}
                      </td>
                      <td className="border px-2 py-1 text-right bg-amber-50/40 text-muted-foreground text-[10px]">
                        {r.freightRatio !== undefined ? fmtPct(r.freightRatio) : '-'}
                      </td>
                      {/* 액션 */}
                      <td className="border px-1 py-1 sticky right-0 bg-background">
                        <div className="flex gap-1">
                          <button onClick={() => duplicateItem(idx)} className="text-muted-foreground hover:text-primary p-0.5" title="복사"><Copy className="w-3 h-3" /></button>
                          <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive p-0.5" title="삭제"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* 합계 행 */}
                {c.items.length > 1 && c.simMode !== 'standard' && (
                  <tr className="bg-muted/50 font-semibold border-t-2">
                    <td className="border px-2 py-1.5 sticky left-0 bg-muted/50 text-xs">합계 / 평균</td>
                    <td colSpan={c.simMode === 'mixed' ? 7 : 6} className="border"></td>
                    {c.simMode === 'mixed' && (
                      <td className="border px-2 py-1.5 text-right text-xs bg-blue-50/50">
                        {c.items.reduce((s, it) => s + (it.mixedCbm || 0), 0).toFixed(1)} / {CONTAINER_CBM[c.containerType]} CBM
                      </td>
                    )}
                    <td colSpan={5} className="border"></td>
                    <td className="border px-2 py-1.5 text-right text-xs bg-amber-50/60">
                      {fmtPct((() => {
                        const calcs = c.items.map(it => calcItem(it, c));
                        const profits = calcs.filter(r => r.profitUsd !== undefined && r.sellingUsd !== undefined);
                        if (!profits.length) return undefined;
                        const totalProfit = profits.reduce((s, r) => s + (r.profitUsd || 0), 0);
                        const totalSelling = profits.reduce((s, r) => s + (r.sellingUsd || 0), 0);
                        return totalSelling > 0 ? totalProfit / totalSelling : undefined;
                      })())}
                    </td>
                    <td colSpan={2} className="border sticky right-0 bg-muted/50"></td>
                  </tr>
                )}

                {c.items.length === 0 && (
                  <tr>
                    <td colSpan={20} className="text-center py-12 text-muted-foreground text-sm">
                      <div>제품을 추가하거나 파일에서 가져오세요</div>
                      <div className="flex gap-2 justify-center mt-3">
                        <Button size="sm" variant="outline" onClick={() => setShowImport(true)}><Upload className="w-3 h-3 mr-1" />파일 가져오기</Button>
                        <Button size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" />제품 추가</Button>
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
