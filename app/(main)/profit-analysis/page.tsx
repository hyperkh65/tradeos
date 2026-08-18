'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Search, X, Loader2, Pencil, Trash2, RefreshCw,
  ChevronDown, ChevronRight, Download, History, TrendingUp,
  Link2, CheckCircle2, AlertCircle, Save, FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductItem {
  id: string;
  name: string;
  qty: number;
  unitPriceCny: number;
  fxRate: number;
  totalKrw: number;
  note?: string;
}

interface ExtraCost {
  id: string;
  name: string;
  amount: number;
}

interface HistoryEntry {
  at: string;
  by: string;
  action: string;
  note?: string;
}

interface PA {
  id: string;
  businessId: string;
  title: string;
  analysisDate?: string;
  saleId?: string;
  saleBusinessId?: string;
  importId?: string;
  importBusinessId?: string;
  saleAmount: number;
  saleCurrency: string;
  exchangeRate: number;
  productItems: ProductItem[];
  freightCost: number;
  inlandFreight: number;
  brokerFee: number;
  duty: number;
  vatImport: number;
  wireFee: number;
  extraCosts: ExtraCost[];
  memo?: string;
  status: string;
  history: HistoryEntry[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface SaleRecord {
  id: string;
  businessId: string;
  customer: string;
  netAmount: number;
  totalAmount: number;
  currency: string;
  saleDate?: string;
  salesperson?: string;
  poNo?: string;
}

interface ImportRecord {
  id: string;
  businessId: string;
  declarationNo?: string;
  status: string;
  freightKrw?: number;
  inlandFreight?: number;
  brokerFee?: number;
  duty?: number;
  vat?: number;
  exchangeRate?: number;
  releaseDate?: string;
  demurrage?: number;
  detentionFee?: number;
  warehouseFee?: number;
  inspectionFee?: number;
}

// ─── Default form ─────────────────────────────────────────────────────────────

function newPid() { return Math.random().toString(36).slice(2, 10); }

const emptyForm = (): Omit<PA, 'id' | 'businessId' | 'history' | 'createdAt' | 'updatedAt'> => ({
  title: '',
  analysisDate: new Date().toISOString().slice(0, 10),
  saleAmount: 0,
  saleCurrency: 'KRW',
  exchangeRate: 1,
  productItems: [],
  freightCost: 0,
  inlandFreight: 0,
  brokerFee: 0,
  duty: 0,
  vatImport: 0,
  wireFee: 0,
  extraCosts: [],
  status: 'draft',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotals(form: ReturnType<typeof emptyForm>) {
  const productTotal = form.productItems.reduce((s, p) => s + (p.totalKrw || 0), 0);
  const logisticTotal = (form.freightCost || 0) + (form.inlandFreight || 0) + (form.brokerFee || 0)
    + (form.duty || 0) + (form.vatImport || 0) + (form.wireFee || 0)
    + form.extraCosts.reduce((s, c) => s + (c.amount || 0), 0);
  const totalCost = productTotal + logisticTotal;
  const profit = (form.saleAmount || 0) - totalCost;
  const profitRate = form.saleAmount > 0 ? (profit / form.saleAmount) * 100 : 0;
  return { productTotal, logisticTotal, totalCost, profit, profitRate };
}

function fmt(n: number) { return Math.round(n).toLocaleString(); }

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfitAnalysisPage() {
  const [list, setList] = useState<PA[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [selected, setSelected] = useState<PA | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Link panel
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkTab, setLinkTab] = useState<'sale' | 'import'>('sale');
  const [linkSales, setLinkSales] = useState<SaleRecord[]>([]);
  const [linkImports, setLinkImports] = useState<ImportRecord[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkQ, setLinkQ] = useState('');

  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const [showPasteArea, setShowPasteArea] = useState(false);

  // ── Load list ───────────────────────────────────────────────────────────────

  const loadList = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/profit-analysis${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const json = await res.json();
      setList(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    const t = setTimeout(() => loadList(searchQ), 300);
    return () => clearTimeout(t);
  }, [searchQ, loadList]);

  // ── Open edit ───────────────────────────────────────────────────────────────

  function openNew() {
    setSelected(null);
    setForm(emptyForm());
    setEditing(true);
    setShowHistory(false);
  }

  function openEdit(pa: PA) {
    setSelected(pa);
    setForm({
      title: pa.title,
      analysisDate: pa.analysisDate || new Date().toISOString().slice(0, 10),
      saleId: pa.saleId, saleBusinessId: pa.saleBusinessId,
      importId: pa.importId, importBusinessId: pa.importBusinessId,
      saleAmount: pa.saleAmount,
      saleCurrency: pa.saleCurrency,
      exchangeRate: pa.exchangeRate,
      productItems: pa.productItems,
      freightCost: pa.freightCost,
      inlandFreight: pa.inlandFreight,
      brokerFee: pa.brokerFee,
      duty: pa.duty,
      vatImport: pa.vatImport,
      wireFee: pa.wireFee,
      extraCosts: pa.extraCosts,
      memo: pa.memo,
      status: pa.status,
    });
    setEditing(true);
    setShowHistory(false);
  }

  // ── Link panel ───────────────────────────────────────────────────────────────

  async function openLink(tab: 'sale' | 'import') {
    setLinkTab(tab);
    setShowLinkPanel(true);
    setLinkQ('');
    if (linkSales.length === 0 || linkImports.length === 0) {
      setLinkLoading(true);
      const [sr, ir] = await Promise.all([
        fetch('/api/sales?limit=200').then(r => r.json()),
        fetch('/api/imports?limit=200').then(r => r.json()),
      ]);
      setLinkSales(sr.data || []);
      setLinkImports(ir.data || []);
      setLinkLoading(false);
    }
  }

  function applySale(s: SaleRecord) {
    setForm(f => ({
      ...f,
      saleId: s.id,
      saleBusinessId: s.businessId,
      saleAmount: s.netAmount || 0,  // VAT 제외 금액
      saleCurrency: s.currency || 'KRW',
      title: f.title || `${s.customer} 수익분석`,
    }));
    setShowLinkPanel(false);
  }

  function applyImport(imp: ImportRecord) {
    setForm(f => ({
      ...f,
      importId: imp.id,
      importBusinessId: imp.businessId,
      freightCost: imp.freightKrw || 0,
      inlandFreight: imp.inlandFreight || 0,
      brokerFee: imp.brokerFee || 0,
      duty: imp.duty || 0,
      vatImport: imp.vat || 0,
    }));
    setShowLinkPanel(false);
  }

  // ── Product items ────────────────────────────────────────────────────────────

  function addProductItem() {
    const p: ProductItem = { id: newPid(), name: '', qty: 0, unitPriceCny: 0, fxRate: 0, totalKrw: 0 };
    setForm(f => ({ ...f, productItems: [...f.productItems, p] }));
  }

  function updateProduct(idx: number, field: keyof ProductItem, val: string | number) {
    setForm(f => {
      const items = f.productItems.map((p, i) => {
        if (i !== idx) return p;
        const updated = { ...p, [field]: val };
        if (field === 'qty' || field === 'unitPriceCny' || field === 'fxRate') {
          updated.totalKrw = Math.round((updated.qty || 0) * (updated.unitPriceCny || 0) * (updated.fxRate || 0));
        }
        if (field === 'totalKrw') {
          updated.totalKrw = Number(val) || 0;
        }
        return updated;
      });
      return { ...f, productItems: items };
    });
  }

  function removeProduct(idx: number) {
    setForm(f => ({ ...f, productItems: f.productItems.filter((_, i) => i !== idx) }));
  }

  // ── Paste handler ─────────────────────────────────────────────────────────────

  function handlePaste(text: string) {
    const lines = text.trim().split('\n');
    const newItems: ProductItem[] = [];
    for (const line of lines) {
      const cols = line.split('\t').map(c => c.trim());
      if (cols.length < 2) continue;
      const name = cols[0];
      const qty = Number(cols[1]?.replace(/,/g, '')) || 0;
      const unitPrice = Number(cols[2]?.replace(/,/g, '')) || 0;
      const fxRate = Number(cols[3]?.replace(/,/g, '')) || 0;
      const totalKrw = fxRate > 0
        ? Math.round(qty * unitPrice * fxRate)
        : (Number(cols[4]?.replace(/,/g, '')) || 0);
      newItems.push({ id: newPid(), name, qty, unitPriceCny: unitPrice, fxRate, totalKrw });
    }
    if (newItems.length > 0) {
      setForm(f => ({ ...f, productItems: [...f.productItems, ...newItems] }));
    }
    setShowPasteArea(false);
  }

  // ── Extra costs ──────────────────────────────────────────────────────────────

  function addExtraCost() {
    setForm(f => ({ ...f, extraCosts: [...f.extraCosts, { id: newPid(), name: '', amount: 0 }] }));
  }

  function updateExtra(idx: number, field: 'name' | 'amount', val: string | number) {
    setForm(f => ({
      ...f,
      extraCosts: f.extraCosts.map((c, i) => i === idx ? { ...c, [field]: val } : c),
    }));
  }

  function removeExtra(idx: number) {
    setForm(f => ({ ...f, extraCosts: f.extraCosts.filter((_, i) => i !== idx) }));
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.title) { alert('제목을 입력하세요.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, updatedBy: 'admin', historyAction: selected ? '수정' : '생성' };
      let res: Response;
      if (selected) {
        res = await fetch(`/api/profit-analysis/${selected.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        res = await fetch('/api/profit-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, createdBy: 'admin' }) });
      }
      const json = await res.json();
      if (res.ok && json.data) {
        setSelected(json.data);
        setEditing(false);
        loadList(searchQ);
      } else {
        alert('저장 실패: ' + (json.error || ''));
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!selected) return;
    await fetch(`/api/profit-analysis/${selected.id}`, { method: 'DELETE' });
    setSelected(null);
    setEditing(false);
    setShowDeleteConfirm(false);
    loadList(searchQ);
  }

  // ── Excel export ─────────────────────────────────────────────────────────────

  function exportExcel(pa: PA) {
    const { productTotal, logisticTotal, totalCost, profit, profitRate } = calcTotals(pa as unknown as ReturnType<typeof emptyForm>);

    const wb = XLSX.utils.book_new();
    const rows: (string | number | null)[][] = [
      ['수익분석서'],
      [pa.title, pa.analysisDate || ''],
      [],
      ['1. 매출금액', '', pa.saleAmount, 'KRW', pa.saleBusinessId || ''],
      [],
      ['2. 제품원가'],
      ['품명', '수량', '단가(CNY)', '환율', '금액(KRW)', '비고'],
      ...pa.productItems.map(p => [p.name, p.qty, p.unitPriceCny, p.fxRate, p.totalKrw, p.note || '']),
      ['소계', '', '', '', productTotal, ''],
      [],
      ['3. 부대비용'],
      ['항목', '', '금액(KRW)'],
      ['포워더 운임', '', pa.freightCost],
      ['내륙운송료', '', pa.inlandFreight],
      ['통관수수료', '', pa.brokerFee],
      ['관세', '', pa.duty],
      ['수입부가세', '', pa.vatImport],
      ['해외송금수수료', '', pa.wireFee],
      ...pa.extraCosts.map(c => [c.name, '', c.amount]),
      ['소계', '', logisticTotal],
      [],
      ['4. 수익'],
      ['총 매출', '', pa.saleAmount],
      ['총 비용', '', totalCost],
      ['수익', '', profit],
      ['수익률', '', `${profitRate.toFixed(2)}%`],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, '수익분석');
    XLSX.writeFile(wb, `수익분석_${pa.businessId}_${pa.title}.xlsx`);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  const totals = calcTotals(form);

  // ── Filtered link lists ───────────────────────────────────────────────────────

  const filteredSales = linkSales.filter(s =>
    !linkQ || s.businessId.includes(linkQ) || s.customer.toLowerCase().includes(linkQ.toLowerCase()) || (s.poNo || '').includes(linkQ)
  );
  const filteredImports = linkImports.filter(i =>
    !linkQ || i.businessId.includes(linkQ) || (i.declarationNo || '').includes(linkQ)
  );

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader title="수익분석" />

      <div className="flex flex-1 overflow-hidden">
        {/* ── 목록 ── */}
        <div className={cn('flex flex-col border-r border-border bg-card transition-all', editing ? 'w-72 shrink-0' : 'flex-1 max-w-lg')}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="검색..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={openNew} className="shrink-0 h-7 text-xs gap-1">
              <Plus className="w-3.5 h-3.5" />새 분석
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                <TrendingUp className="w-8 h-8 opacity-30" />
                <span>분석 데이터 없음</span>
                <button onClick={openNew} className="text-xs text-blue-500 hover:underline">+ 새 수익분석 만들기</button>
              </div>
            ) : list.map(pa => {
              const { profit, profitRate } = calcTotals(pa as unknown as ReturnType<typeof emptyForm>);
              const isActive = selected?.id === pa.id;
              return (
                <div key={pa.id}
                  className={cn('px-3 py-2.5 border-b border-border cursor-pointer hover:bg-muted/40 transition-colors', isActive && 'bg-blue-50 border-l-2 border-l-blue-500')}
                  onClick={() => { setSelected(pa); setEditing(false); setShowHistory(false); }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-mono">{pa.businessId}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', pa.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                      {pa.status === 'confirmed' ? '확정' : '작성중'}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{pa.analysisDate || ''}</span>
                  </div>
                  <div className="text-sm font-medium mt-0.5 truncate">{pa.title}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    {pa.saleBusinessId && <span className="text-blue-600">{pa.saleBusinessId}</span>}
                    {pa.importBusinessId && <span className="text-orange-600">{pa.importBusinessId}</span>}
                    <span className={cn('ml-auto font-semibold', profit >= 0 ? 'text-blue-600' : 'text-red-600')}>
                      {profit >= 0 ? '+' : ''}{fmt(profit)}원 ({profitRate.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 상세/편집 ── */}
        {(selected || editing) && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
              {selected && !editing && (
                <>
                  <span className="text-xs font-mono text-muted-foreground">{selected.businessId}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', selected.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                    {selected.status === 'confirmed' ? '확정' : '작성중'}
                  </span>
                  <span className="font-semibold text-sm">{selected.title}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => exportExcel(selected)}>
                      <FileSpreadsheet className="w-3.5 h-3.5" />엑셀
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openEdit(selected)}>
                      <Pencil className="w-3.5 h-3.5" />편집
                    </Button>
                    {showDeleteConfirm ? (
                      <>
                        <span className="text-xs text-red-600">삭제?</span>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowDeleteConfirm(false)}>취소</Button>
                        <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete}>삭제</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 hover:bg-red-50 gap-1" onClick={() => setShowDeleteConfirm(true)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </>
              )}
              {editing && (
                <>
                  <span className="text-sm font-semibold">{selected ? '수익분석 편집' : '새 수익분석'}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditing(false); if (!selected) { setSelected(null); } }}>취소</Button>
                    <Button size="sm" className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}저장
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* ── 편집 모드 ── */}
              {editing && (
                <>
                  {/* 기본 정보 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">제목 *</label>
                      <Input className="mt-1 h-8 text-sm" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 동일이엔티 컨버터 수익분석" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">분석일</label>
                      <Input type="date" className="mt-1 h-8 text-sm" value={form.analysisDate || ''} onChange={e => setForm(f => ({ ...f, analysisDate: e.target.value }))} />
                    </div>
                  </div>

                  {/* 연결 */}
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-blue-500" />연결 (매출/수입통관)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-muted/30 truncate">
                          {form.saleBusinessId ? <span className="text-blue-600 font-medium">{form.saleBusinessId}</span> : <span className="text-muted-foreground">매출 미연결</span>}
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => openLink('sale')}>선택</Button>
                        {form.saleId && <button className="text-muted-foreground hover:text-foreground" onClick={() => setForm(f => ({ ...f, saleId: undefined, saleBusinessId: undefined }))}><X className="w-3.5 h-3.5" /></button>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-muted/30 truncate">
                          {form.importBusinessId ? <span className="text-orange-600 font-medium">{form.importBusinessId}</span> : <span className="text-muted-foreground">수입통관 미연결</span>}
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => openLink('import')}>선택</Button>
                        {form.importId && <button className="text-muted-foreground hover:text-foreground" onClick={() => setForm(f => ({ ...f, importId: undefined, importBusinessId: undefined }))}><X className="w-3.5 h-3.5" /></button>}
                      </div>
                    </div>
                  </div>

                  {/* 매출금액 */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-3 space-y-2">
                    <div className="text-xs font-semibold text-blue-700">1. 매출금액</div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="col-span-2">
                        <label className="text-[11px] text-muted-foreground">금액 (VAT 제외)</label>
                        <Input type="number" className="mt-1 h-7 text-xs" value={form.saleAmount || ''} onChange={e => setForm(f => ({ ...f, saleAmount: Number(e.target.value) || 0 }))} placeholder="0" />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">통화</label>
                        <select className="mt-1 w-full h-7 text-xs rounded border border-input bg-background px-2"
                          value={form.saleCurrency} onChange={e => setForm(f => ({ ...f, saleCurrency: e.target.value }))}>
                          <option>KRW</option><option>USD</option><option>CNY</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">환율 (≠KRW 시)</label>
                        <Input type="number" className="mt-1 h-7 text-xs" value={form.saleCurrency !== 'KRW' ? (form.exchangeRate || '') : ''} disabled={form.saleCurrency === 'KRW'} onChange={e => setForm(f => ({ ...f, exchangeRate: Number(e.target.value) || 1 }))} placeholder="1" />
                      </div>
                    </div>
                  </div>

                  {/* 제품원가 */}
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">2. 제품원가</span>
                      <button className="ml-auto text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1" onClick={() => setShowPasteArea(p => !p)}>
                        {showPasteArea ? '붙여넣기 닫기' : '엑셀에서 붙여넣기'}
                      </button>
                      <button className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1" onClick={addProductItem}>
                        <Plus className="w-3 h-3" />행 추가
                      </button>
                    </div>

                    {showPasteArea && (
                      <div className="space-y-1">
                        <div className="text-[11px] text-muted-foreground">형식: 품명 TAB 수량 TAB 단가(CNY) TAB 환율 TAB 금액(KRW)</div>
                        <textarea ref={pasteRef} rows={4}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs font-mono resize-y"
                          placeholder="엑셀에서 복사한 내용을 붙여넣으세요..."
                          onPaste={e => { setTimeout(() => { handlePaste(e.currentTarget.value); e.currentTarget.value = ''; }, 50); }}
                        />
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { if (pasteRef.current) { handlePaste(pasteRef.current.value); pasteRef.current.value = ''; } }}>적용</Button>
                      </div>
                    )}

                    {form.productItems.length > 0 && (
                      <div className="rounded border border-border overflow-hidden text-xs">
                        <div className="grid bg-muted/50 font-medium text-muted-foreground" style={{ gridTemplateColumns: '2.5fr 0.8fr 1fr 0.8fr 1.2fr 28px' }}>
                          {['품명', '수량', '단가(CNY)', '환율', '금액(KRW)', ''].map(h => <div key={h} className="px-2 py-1.5">{h}</div>)}
                        </div>
                        {form.productItems.map((p, idx) => (
                          <div key={p.id} className="grid border-t border-border" style={{ gridTemplateColumns: '2.5fr 0.8fr 1fr 0.8fr 1.2fr 28px' }}>
                            <input className="px-2 py-1 text-xs bg-transparent border-r border-border focus:outline-none focus:bg-blue-50/50" value={p.name} onChange={e => updateProduct(idx, 'name', e.target.value)} placeholder="품명" />
                            <input type="number" className="px-2 py-1 text-xs bg-transparent border-r border-border focus:outline-none focus:bg-blue-50/50" value={p.qty || ''} onChange={e => updateProduct(idx, 'qty', Number(e.target.value))} placeholder="0" />
                            <input type="number" className="px-2 py-1 text-xs bg-transparent border-r border-border focus:outline-none focus:bg-blue-50/50" value={p.unitPriceCny || ''} onChange={e => updateProduct(idx, 'unitPriceCny', Number(e.target.value))} placeholder="0.00" />
                            <input type="number" className="px-2 py-1 text-xs bg-transparent border-r border-border focus:outline-none focus:bg-blue-50/50" value={p.fxRate || ''} onChange={e => updateProduct(idx, 'fxRate', Number(e.target.value))} placeholder="환율" />
                            <input type="number" className="px-2 py-1 text-xs bg-transparent border-r border-border focus:outline-none focus:bg-blue-50/50" value={p.totalKrw || ''} onChange={e => updateProduct(idx, 'totalKrw', Number(e.target.value))} placeholder="직접입력가능" />
                            <button className="flex items-center justify-center text-muted-foreground hover:text-red-500" onClick={() => removeProduct(idx)}><X className="w-3 h-3" /></button>
                          </div>
                        ))}
                        <div className="grid border-t-2 border-border bg-muted/30 font-semibold text-xs" style={{ gridTemplateColumns: '2.5fr 0.8fr 1fr 0.8fr 1.2fr 28px' }}>
                          <div className="px-2 py-1.5 col-span-4">소계</div>
                          <div className="px-2 py-1.5">{fmt(totals.productTotal)}원</div>
                          <div />
                        </div>
                      </div>
                    )}
                    {form.productItems.length === 0 && (
                      <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-lg">
                        제품 항목 없음 — 행 추가 또는 엑셀에서 붙여넣기
                      </div>
                    )}
                  </div>

                  {/* 부대비용 */}
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="text-xs font-semibold">3. 부대비용 (물류·통관)</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      {[
                        { label: '포워더 운임', key: 'freightCost' as const },
                        { label: '내륙운송료', key: 'inlandFreight' as const },
                        { label: '통관수수료', key: 'brokerFee' as const },
                        { label: '관세', key: 'duty' as const },
                        { label: '수입부가세', key: 'vatImport' as const },
                        { label: '해외송금수수료', key: 'wireFee' as const },
                      ].map(({ label, key }) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
                          <Input type="number" className="h-7 text-xs flex-1" value={(form[key] as number) || ''} placeholder="0"
                            onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) || 0 }))} />
                          <span className="text-muted-foreground shrink-0">원</span>
                        </div>
                      ))}
                    </div>

                    {/* 추가 비용 */}
                    {form.extraCosts.map((c, idx) => (
                      <div key={c.id} className="flex items-center gap-2 text-xs">
                        <Input className="h-7 text-xs w-28" value={c.name} placeholder="항목명" onChange={e => updateExtra(idx, 'name', e.target.value)} />
                        <Input type="number" className="h-7 text-xs flex-1" value={c.amount || ''} placeholder="0" onChange={e => updateExtra(idx, 'amount', Number(e.target.value))} />
                        <span className="text-muted-foreground">원</span>
                        <button onClick={() => removeExtra(idx)} className="text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1" onClick={addExtraCost}>
                      <Plus className="w-3 h-3" />비용 항목 추가
                    </button>
                  </div>

                  {/* 상태 / 메모 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">상태</label>
                      <select className="mt-1 w-full h-8 text-xs rounded border border-input bg-background px-2"
                        value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="draft">작성중</option>
                        <option value="confirmed">확정</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">메모</label>
                      <Input className="mt-1 h-8 text-xs" value={form.memo || ''} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="메모" />
                    </div>
                  </div>

                  {/* 실시간 수익 미리보기 */}
                  <SummaryBox totals={totals} saleAmount={form.saleAmount} />
                </>
              )}

              {/* ── 읽기 모드 ── */}
              {!editing && selected && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">분석일</div>
                      <div className="font-medium">{selected.analysisDate || '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground">연결</div>
                      <div className="flex gap-2">
                        {selected.saleBusinessId && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full text-[10px]">{selected.saleBusinessId}</span>}
                        {selected.importBusinessId && <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full text-[10px]">{selected.importBusinessId}</span>}
                      </div>
                    </div>
                  </div>

                  {/* 매출 */}
                  <ViewSection title="1. 매출금액" color="blue">
                    <div className="flex justify-between text-sm font-semibold">
                      <span>{selected.saleCurrency !== 'KRW' ? `${selected.saleCurrency} → KRW (환율 ${selected.exchangeRate})` : '매출금액 (VAT 제외)'}</span>
                      <span>{fmt(selected.saleAmount)}원</span>
                    </div>
                  </ViewSection>

                  {/* 제품원가 */}
                  {selected.productItems.length > 0 && (
                    <ViewSection title="2. 제품원가">
                      <div className="rounded border border-border overflow-hidden text-xs">
                        <div className="grid bg-muted/50 font-medium text-muted-foreground" style={{ gridTemplateColumns: '3fr 0.8fr 1fr 0.8fr 1.2fr' }}>
                          {['품명', '수량', '단가(CNY)', '환율', '금액(KRW)'].map(h => <div key={h} className="px-2 py-1.5">{h}</div>)}
                        </div>
                        {selected.productItems.map((p, i) => (
                          <div key={i} className="grid border-t border-border" style={{ gridTemplateColumns: '3fr 0.8fr 1fr 0.8fr 1.2fr' }}>
                            <div className="px-2 py-1.5">{p.name}</div>
                            <div className="px-2 py-1.5 text-muted-foreground">{(p.qty || 0).toLocaleString()}</div>
                            <div className="px-2 py-1.5 text-muted-foreground">{p.unitPriceCny}</div>
                            <div className="px-2 py-1.5 text-muted-foreground">{p.fxRate}</div>
                            <div className="px-2 py-1.5 font-medium">{fmt(p.totalKrw)}원</div>
                          </div>
                        ))}
                        <div className="grid border-t-2 border-border bg-muted/30 font-semibold text-xs" style={{ gridTemplateColumns: '3fr 0.8fr 1fr 0.8fr 1.2fr' }}>
                          <div className="px-2 py-1.5 col-span-4">소계</div>
                          <div className="px-2 py-1.5">{fmt(calcTotals(selected as unknown as ReturnType<typeof emptyForm>).productTotal)}원</div>
                        </div>
                      </div>
                    </ViewSection>
                  )}

                  {/* 부대비용 */}
                  <ViewSection title="3. 부대비용">
                    <div className="space-y-1 text-xs">
                      {[
                        { label: '포워더 운임', val: selected.freightCost },
                        { label: '내륙운송료', val: selected.inlandFreight },
                        { label: '통관수수료', val: selected.brokerFee },
                        { label: '관세', val: selected.duty },
                        { label: '수입부가세', val: selected.vatImport },
                        { label: '해외송금수수료', val: selected.wireFee },
                        ...selected.extraCosts.map(c => ({ label: c.name, val: c.amount })),
                      ].filter(r => r.val > 0).map((r, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-muted-foreground">{r.label}</span>
                          <span>{fmt(r.val)}원</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>소계</span>
                        <span>{fmt(calcTotals(selected as unknown as ReturnType<typeof emptyForm>).logisticTotal)}원</span>
                      </div>
                    </div>
                  </ViewSection>

                  {/* 수익 요약 */}
                  <SummaryBox totals={calcTotals(selected as unknown as ReturnType<typeof emptyForm>)} saleAmount={selected.saleAmount} />

                  {/* 메모 */}
                  {selected.memo && (
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">{selected.memo}</div>
                  )}

                  {/* 히스토리 */}
                  {selected.history.length > 0 && (
                    <div>
                      <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowHistory(h => !h)}>
                        <History className="w-3.5 h-3.5" />히스토리 ({selected.history.length})
                        {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                      {showHistory && (
                        <div className="mt-2 space-y-1">
                          {[...selected.history].reverse().map((h, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1 bg-muted/30 rounded">
                              <span className="shrink-0">{new Date(h.at).toLocaleString('ko-KR')}</span>
                              <span className="shrink-0 font-medium text-foreground">{h.by}</span>
                              <span className="px-1.5 py-0.5 bg-background border rounded-full text-[10px]">{h.action}</span>
                              {h.note && <span className="truncate">{h.note}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── 링크 패널 (모달) ── */}
        {showLinkPanel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowLinkPanel(false)}>
            <div className="bg-card rounded-xl shadow-xl w-[560px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <div className="flex gap-2">
                  {(['sale', 'import'] as const).map(t => (
                    <button key={t} className={cn('text-xs px-3 py-1 rounded-full transition-colors', linkTab === t ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')} onClick={() => setLinkTab(t)}>
                      {t === 'sale' ? '매출관리' : '수입통관'}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input className="w-full pl-7 pr-2 py-1 text-xs rounded border border-input bg-background" placeholder="검색..." value={linkQ} onChange={e => setLinkQ(e.target.value)} />
                </div>
                <button onClick={() => setShowLinkPanel(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {linkLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : linkTab === 'sale' ? (
                  filteredSales.length === 0 ? <div className="py-8 text-center text-xs text-muted-foreground">매출 없음</div> :
                  filteredSales.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border hover:bg-muted/40 cursor-pointer" onClick={() => applySale(s)}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{s.customer}</div>
                        <div className="text-[10px] text-muted-foreground">{s.businessId} · {s.saleDate || ''}{s.poNo ? ` · PO: ${s.poNo}` : ''}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold text-blue-600">{fmt(s.netAmount)} {s.currency}</div>
                        <div className="text-[10px] text-muted-foreground">VAT제외</div>
                      </div>
                    </div>
                  ))
                ) : (
                  filteredImports.length === 0 ? <div className="py-8 text-center text-xs text-muted-foreground">수입통관 없음</div> :
                  filteredImports.map(i => (
                    <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border hover:bg-muted/40 cursor-pointer" onClick={() => applyImport(i)}>
                      <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{i.businessId}</div>
                        <div className="text-[10px] text-muted-foreground">{i.declarationNo || '신고번호 없음'} · {i.releaseDate || ''}</div>
                      </div>
                      <div className="text-xs text-orange-600 shrink-0">
                        {i.duty ? `관세 ${fmt(i.duty)}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ViewSection({ title, children, color = 'default' }: { title: string; children: React.ReactNode; color?: 'blue' | 'default' }) {
  return (
    <div className={cn('rounded-lg border p-3 space-y-2', color === 'blue' ? 'border-blue-200 bg-blue-50/30' : 'border-border')}>
      <div className={cn('text-xs font-semibold', color === 'blue' ? 'text-blue-700' : '')}>{title}</div>
      {children}
    </div>
  );
}

function SummaryBox({ totals, saleAmount }: { totals: ReturnType<typeof calcTotals>; saleAmount: number }) {
  const { productTotal, logisticTotal, totalCost, profit, profitRate } = totals;
  return (
    <div className={cn('rounded-xl border-2 p-4 space-y-3', profit >= 0 ? 'border-blue-300 bg-blue-50/50' : 'border-red-300 bg-red-50/50')}>
      <div className="text-xs font-semibold text-muted-foreground">수익 계산</div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground text-xs">매출금액</span>
          <span className="font-medium">{fmt(saleAmount)}원</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground text-xs">└ 제품원가</span>
          <span className="text-xs">- {fmt(productTotal)}원</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground text-xs">└ 부대비용</span>
          <span className="text-xs">- {fmt(logisticTotal)}원</span>
        </div>
        <div className="border-t pt-1.5 flex justify-between items-end">
          <span className="text-xs text-muted-foreground">총 비용</span>
          <span className="text-xs font-medium">{fmt(totalCost)}원</span>
        </div>
      </div>
      <div className={cn('rounded-lg p-3 flex items-center justify-between', profit >= 0 ? 'bg-blue-100' : 'bg-red-100')}>
        <div>
          <div className="text-xs text-muted-foreground">수익</div>
          <div className={cn('text-xl font-bold', profit >= 0 ? 'text-blue-700' : 'text-red-700')}>
            {profit >= 0 ? '+' : ''}{fmt(profit)}원
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">수익률</div>
          <div className={cn('text-2xl font-bold', profit >= 0 ? 'text-blue-700' : 'text-red-700')}>
            {profitRate.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
