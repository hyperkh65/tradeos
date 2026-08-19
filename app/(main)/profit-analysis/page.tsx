'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Search, X, Loader2, Pencil, Trash2,
  ChevronDown, ChevronRight, History, TrendingUp,
  Link2, CheckCircle2, AlertCircle, Save, FileSpreadsheet,
  Copy, Printer, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useCallback } from 'react';
// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductItem {
  id: string;
  name: string;
  spec?: string;
  qty: number;
  currency: string;
  unitPriceFx: number;
  totalKrwManual?: number;
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
  customsExRate: number;
  wireExRate: number;
  supplierName: string;
  customerName: string;
  productItems: ProductItem[];
  freightCost: number;
  inlandFreight: number;
  brokerFee: number;
  duty: number;
  vatImport: number;
  wireFee: number;
  extraCosts: ExtraCost[];
  advancePayment: number;
  paymentAmount: number;
  actualPayment: number;
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
  invoiceCurrency?: string;
  exchangeRate?: number;
  freightKrw?: number;
  freightHandling?: { name: string; amtKrw: number; vat: number; includedInCif?: boolean }[];
  inlandFreight?: number;
  brokerFee?: number;
  duty?: number;
  vat?: number;
  releaseDate?: string;
  items?: { productName: string; qty?: number; unitPrice?: number }[];
  customCosts?: { name: string; amount: number }[];
  warehouseFee?: number;
  detentionFee?: number;
  demurrage?: number;
  inspectionFee?: number;
  supplierName?: string;
}

// ─── Default form ─────────────────────────────────────────────────────────────

function newPid() { return Math.random().toString(36).slice(2, 10); }

type FormState = Omit<PA, 'id' | 'businessId' | 'history' | 'createdAt' | 'updatedAt'>;

const emptyForm = (): FormState => ({
  title: '',
  analysisDate: new Date().toISOString().slice(0, 10),
  saleAmount: 0,
  saleCurrency: 'KRW',
  exchangeRate: 1,
  customsExRate: 0,
  wireExRate: 0,
  supplierName: '',
  customerName: '',
  productItems: [],
  freightCost: 0,
  inlandFreight: 0,
  brokerFee: 0,
  duty: 0,
  vatImport: 0,
  wireFee: 0,
  extraCosts: [],
  advancePayment: 0,
  paymentAmount: 0,
  actualPayment: 0,
  status: 'draft',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotals(form: FormState) {
  const cex = form.customsExRate || 1;
  const wex = form.wireExRate || form.customsExRate || 1;

  let productTotal1 = 0;
  let productTotal2 = 0;
  for (const p of form.productItems) {
    if (p.totalKrwManual && p.totalKrwManual > 0) {
      productTotal1 += p.totalKrwManual;
      productTotal2 += p.totalKrwManual;
    } else {
      productTotal1 += Math.round((p.qty || 0) * (p.unitPriceFx || 0) * cex);
      productTotal2 += Math.round((p.qty || 0) * (p.unitPriceFx || 0) * wex);
    }
  }

  const logisticTotal =
    (form.freightCost || 0) +
    (form.inlandFreight || 0) +
    (form.brokerFee || 0) +
    (form.duty || 0) +
    (form.wireFee || 0) +
    (form.extraCosts || []).reduce((s, c) => s + (c.amount || 0), 0);

  const saleKrw = form.saleAmount || 0;
  const totalCost = productTotal2 + logisticTotal;
  const profit = saleKrw - totalCost;
  const profitRate = saleKrw > 0 ? (profit / saleKrw) * 100 : 0;

  return { productTotal1, productTotal2, logisticTotal, totalCost, profit, profitRate };
}

function fmt(n: number) { return Math.round(n).toLocaleString(); }

function paToForm(pa: PA): FormState {
  return {
    title: pa.title,
    analysisDate: pa.analysisDate || new Date().toISOString().slice(0, 10),
    saleId: pa.saleId,
    saleBusinessId: pa.saleBusinessId,
    importId: pa.importId,
    importBusinessId: pa.importBusinessId,
    saleAmount: pa.saleAmount,
    saleCurrency: pa.saleCurrency,
    exchangeRate: pa.exchangeRate,
    customsExRate: pa.customsExRate || 0,
    wireExRate: pa.wireExRate || 0,
    supplierName: pa.supplierName || '',
    customerName: pa.customerName || '',
    productItems: (pa.productItems || []).map(p => ({
      id: p.id || newPid(),
      name: p.name || '',
      spec: p.spec || '',
      qty: p.qty || 0,
      currency: p.currency || 'CNY',
      unitPriceFx: p.unitPriceFx || (p as unknown as { unitPriceCny?: number }).unitPriceCny || 0,
      totalKrwManual: p.totalKrwManual,
    })),
    freightCost: pa.freightCost,
    inlandFreight: pa.inlandFreight,
    brokerFee: pa.brokerFee,
    duty: pa.duty,
    vatImport: pa.vatImport,
    wireFee: pa.wireFee,
    extraCosts: pa.extraCosts,
    advancePayment: pa.advancePayment || 0,
    paymentAmount: pa.paymentAmount || 0,
    actualPayment: pa.actualPayment || 0,
    memo: pa.memo,
    status: pa.status,
  };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfitAnalysisPage() {
  const [list, setList] = useState<PA[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [selected, setSelected] = useState<PA | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkTab, setLinkTab] = useState<'sale' | 'import'>('sale');
  const [linkSales, setLinkSales] = useState<SaleRecord[]>([]);
  const [linkImports, setLinkImports] = useState<ImportRecord[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkQ, setLinkQ] = useState('');
  const [notionSaving, setNotionSaving] = useState(false);

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
    setForm(paToForm(pa));
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
      saleAmount: s.netAmount || 0,
      saleCurrency: s.currency || 'KRW',
      customerName: s.customer || f.customerName,
      title: f.title || `${s.customer} 수익분석`,
    }));
    setShowLinkPanel(false);
  }

  function applyImport(imp: ImportRecord) {
    const handlingTotal = (imp.freightHandling || []).reduce((s, h) => s + (h.amtKrw || 0) + (h.vat || 0), 0);
    const freightCost = (imp.freightKrw || 0) + handlingTotal;

    // import items → productItems
    const productItems: ProductItem[] = (imp.items || []).map(item => ({
      id: newPid(),
      name: item.productName || '',
      spec: '',
      qty: item.qty || 0,
      currency: imp.invoiceCurrency || 'CNY',
      unitPriceFx: item.unitPrice || 0,
      totalKrwManual: undefined,
    }));

    // 통관 기타비용 전체 → extraCosts
    const extraCosts: ExtraCost[] = [
      ...(imp.demurrage    && imp.demurrage    > 0 ? [{ id: newPid(), name: 'Demurrage/DEM(체화료)',      amount: imp.demurrage    }] : []),
      ...(imp.detentionFee && imp.detentionFee > 0 ? [{ id: newPid(), name: 'Detention/DET(지체료)',      amount: imp.detentionFee }] : []),
      ...(imp.warehouseFee && imp.warehouseFee > 0 ? [{ id: newPid(), name: 'Terminal Storage(장치료)',   amount: imp.warehouseFee }] : []),
      ...(imp.inspectionFee && imp.inspectionFee > 0 ? [{ id: newPid(), name: '세관검사비',              amount: imp.inspectionFee }] : []),
      ...(imp.customCosts || []).filter(c => c.name && c.amount > 0).map(c => ({ id: newPid(), name: c.name, amount: c.amount })),
    ];

    setForm(f => ({
      ...f,
      importId: imp.id,
      importBusinessId: imp.businessId,
      customsExRate: imp.exchangeRate || 0,
      freightCost,
      inlandFreight: imp.inlandFreight || 0,
      brokerFee: imp.brokerFee || 0,
      duty: imp.duty || 0,
      vatImport: imp.vat || 0,
      supplierName: imp.supplierName || f.supplierName,
      extraCosts: extraCosts.length > 0 ? extraCosts : f.extraCosts,
      productItems: productItems.length > 0 ? productItems : f.productItems,
    }));
    setShowLinkPanel(false);
  }

  // ── Product items ────────────────────────────────────────────────────────────

  function addProductItem() {
    setForm(f => ({
      ...f,
      productItems: [...f.productItems, {
        id: newPid(), name: '', spec: '', qty: 0, currency: 'CNY', unitPriceFx: 0,
      }],
    }));
  }

  function updateProduct(idx: number, field: keyof ProductItem, val: string | number | undefined) {
    setForm(f => ({
      ...f,
      productItems: f.productItems.map((p, i) => i === idx ? { ...p, [field]: val } : p),
    }));
  }

  function removeProduct(idx: number) {
    setForm(f => ({ ...f, productItems: f.productItems.filter((_, i) => i !== idx) }));
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
        res = await fetch(`/api/profit-analysis/${selected.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/profit-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, createdBy: 'admin' }),
        });
      }
      const json = await res.json();
      if (res.ok && json.data) {
        setSelected(json.data);
        setEditing(false);
        loadList(searchQ);
        // Notion 자동저장 (비동기, 실패 무시)
        fetch(`/api/profit-analysis/${json.data.id}/notion`, { method: 'POST' }).catch(() => {});
      } else {
        alert('저장 실패: ' + (json.error || ''));
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Copy ─────────────────────────────────────────────────────────────────────

  async function handleCopy() {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = {
        ...paToForm(selected),
        title: `${selected.title} (복사)`,
        status: 'draft',
        createdBy: 'admin',
        historyAction: '복사',
      };
      const res = await fetch('/api/profit-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        loadList(searchQ);
        setSelected(json.data);
        setEditing(false);
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

  // ── Print ─────────────────────────────────────────────────────────────────────

  function handlePrint() {
    window.print();
  }

  // ── Excel export (서버 API → ExcelJS 표 형식) ────────────────────────────────

  function exportExcel(pa: PA) {
    window.location.href = `/api/profit-analysis/${pa.id}/excel`;
  }

  // ── Notion 저장 ──────────────────────────────────────────────────────────────

  async function handleNotion(pa: PA) {
    setNotionSaving(true);
    try {
      const res = await fetch(`/api/profit-analysis/${pa.id}/notion`, { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.notionUrl) {
        window.open(json.notionUrl, '_blank');
      } else {
        alert(`Notion 저장 실패: ${json.error || '알 수 없는 오류'}`);
      }
    } finally {
      setNotionSaving(false);
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  const totals = calcTotals(form);
  const cex = form.customsExRate || 1;
  const wex = form.wireExRate || form.customsExRate || 1;

  const filteredSales = linkSales.filter(s =>
    !linkQ || s.businessId.includes(linkQ) || s.customer.toLowerCase().includes(linkQ.toLowerCase()) || (s.poNo || '').includes(linkQ)
  );
  const filteredImports = linkImports.filter(i =>
    !linkQ || i.businessId.includes(linkQ) || (i.declarationNo || '').includes(linkQ)
  );

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background print:h-auto">
      <AppHeader title="수익분석" />

      <div className="flex flex-1 overflow-hidden print:block">
        {/* ── 목록 ── */}
        <div className={cn('flex flex-col border-r border-border bg-card transition-all print:hidden', editing ? 'w-72 shrink-0' : 'flex-1 max-w-lg')}>
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
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                <TrendingUp className="w-8 h-8 opacity-30" />
                <span>분석 데이터 없음</span>
                <button onClick={openNew} className="text-xs text-blue-500 hover:underline">+ 새 수익분석 만들기</button>
              </div>
            ) : list.map(pa => {
              const t = calcTotals(paToForm(pa));
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
                    <span className={cn('ml-auto font-semibold', t.profit >= 0 ? 'text-blue-600' : 'text-red-600')}>
                      {t.profit >= 0 ? '+' : ''}{fmt(t.profit)}원 ({t.profitRate.toFixed(1)}%)
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
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card print:hidden">
              {selected && !editing && (
                <>
                  <span className="text-xs font-mono text-muted-foreground">{selected.businessId}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', selected.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                    {selected.status === 'confirmed' ? '확정' : '작성중'}
                  </span>
                  <span className="font-semibold text-sm truncate">{selected.title}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => exportExcel(selected)}>
                      <FileSpreadsheet className="w-3.5 h-3.5" />엑셀
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-purple-700 border-purple-300 hover:bg-purple-50" onClick={() => handleNotion(selected)} disabled={notionSaving}>
                      <Upload className="w-3.5 h-3.5" />{notionSaving ? '저장중…' : 'Notion'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handlePrint}>
                      <Printer className="w-3.5 h-3.5" />인쇄
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCopy} disabled={saving}>
                      <Copy className="w-3.5 h-3.5" />복사
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
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditing(false); if (!selected) setSelected(null); }}>취소</Button>
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
                    {form.importBusinessId && (
                      <div className="text-[11px] text-orange-700 bg-orange-50 rounded px-2 py-1">
                        수입통관 연결 시 환율①·제품내역·비용이 자동 적용됩니다. 환율②(실제송금환율)는 직접 입력하세요.
                      </div>
                    )}
                  </div>

                  {/* 공급사/매출처 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-muted-foreground">공급사명 (중국 공급업체)</label>
                      <Input className="mt-1 h-7 text-xs" value={form.supplierName || ''} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="예: PUYU" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">매출업체명 (고객사)</label>
                      <Input className="mt-1 h-7 text-xs" value={form.customerName || ''} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="예: 동양이앤티" />
                    </div>
                  </div>

                  {/* 매출금액 */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-3 space-y-2">
                    <div className="text-xs font-semibold text-blue-700">① 매출금액</div>
                    <div className="grid grid-cols-3 gap-2">
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
                    </div>
                  </div>

                  {/* 환율 */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-700">환율</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-muted-foreground">① 통관환율 (수입통관 기준, 자동)</label>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Input type="number" className="h-7 text-xs flex-1" value={form.customsExRate || ''} onChange={e => setForm(f => ({ ...f, customsExRate: Number(e.target.value) || 0 }))} placeholder="자동입력" />
                          <span className="text-xs text-muted-foreground shrink-0">원/CNY</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">② 실제송금환율 (잔금 기준, 직접입력)</label>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Input type="number" className="h-7 text-xs flex-1" value={form.wireExRate || ''} onChange={e => setForm(f => ({ ...f, wireExRate: Number(e.target.value) || 0 }))} placeholder="직접입력" />
                          <span className="text-xs text-muted-foreground shrink-0">원/CNY</span>
                        </div>
                      </div>
                    </div>
                    {form.customsExRate > 0 && form.wireExRate > 0 && (
                      <div className="text-[11px] text-amber-700">
                        환율 차이: {fmt(form.wireExRate - form.customsExRate)} 원 ({((form.wireExRate - form.customsExRate) / form.customsExRate * 100).toFixed(2)}%)
                      </div>
                    )}
                  </div>

                  {/* 비용 */}
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="text-xs font-semibold">③ 물류·통관 비용</div>
                    <div className="space-y-1.5 text-xs">
                      {[
                        { label: '포워더 운임 (해상+부대비용 포함)', key: 'freightCost' as const },
                        { label: '내륙운송료', key: 'inlandFreight' as const },
                        { label: '통관수수료', key: 'brokerFee' as const },
                        { label: '관세', key: 'duty' as const },
                        { label: '해외송금수수료', key: 'wireFee' as const },
                      ].map(({ label, key }) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="w-44 shrink-0 text-muted-foreground">{label}</span>
                          <Input type="number" className="h-7 text-xs flex-1" value={(form[key] as number) || ''} placeholder="0"
                            onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) || 0 }))} />
                          <span className="text-muted-foreground shrink-0 w-4">원</span>
                        </div>
                      ))}

                      {/* 수입부가세 (참고용) */}
                      <div className="flex items-center gap-2 pt-1 border-t border-dashed border-border">
                        <span className="w-44 shrink-0 text-muted-foreground">수입부가세 (참고용)</span>
                        <Input type="number" className="h-7 text-xs flex-1 bg-gray-50" value={form.vatImport || ''} placeholder="0"
                          onChange={e => setForm(f => ({ ...f, vatImport: Number(e.target.value) || 0 }))} />
                        <span className="text-muted-foreground shrink-0 w-4">원</span>
                        <span className="text-[10px] text-gray-400">매입세액공제, 비용미포함</span>
                      </div>
                    </div>

                    {/* 기타비용 */}
                    {form.extraCosts.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-border">
                        <div className="text-[11px] text-muted-foreground font-medium">기타비용</div>
                        {form.extraCosts.map((c, idx) => (
                          <div key={c.id} className="flex items-center gap-2 text-xs">
                            <Input className="h-7 text-xs w-40" value={c.name} placeholder="항목명" onChange={e => updateExtra(idx, 'name', e.target.value)} />
                            <Input type="number" className="h-7 text-xs flex-1" value={c.amount || ''} placeholder="0" onChange={e => updateExtra(idx, 'amount', Number(e.target.value))} />
                            <span className="text-muted-foreground">원</span>
                            <button onClick={() => removeExtra(idx)} className="text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="button" className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1" onClick={addExtraCost}>
                      <Plus className="w-3 h-3" />기타비용 추가
                    </button>
                  </div>

                  {/* 제품원가 */}
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">② 제품원가</span>
                      {form.customsExRate > 0 && (
                        <span className="text-[10px] text-muted-foreground">①환율{fmt(form.customsExRate)} / ②환율{form.wireExRate > 0 ? fmt(form.wireExRate) : '미입력'}</span>
                      )}
                      <button className="ml-auto text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1" onClick={addProductItem}>
                        <Plus className="w-3 h-3" />행 추가
                      </button>
                    </div>

                    {form.productItems.length > 0 ? (
                      <div className="rounded border border-border overflow-x-auto text-xs">
                        <div className="grid bg-muted/50 font-medium text-muted-foreground min-w-[640px]" style={{ gridTemplateColumns: '2fr 1fr 0.7fr 1fr 1.1fr 1.1fr 28px' }}>
                          {['품명', '규격', '수량', '단가(CNY)', `①원가(×${cex})`, `②원가(×${wex || '?'})`, ''].map(h => (
                            <div key={h} className="px-2 py-1.5">{h}</div>
                          ))}
                        </div>
                        {form.productItems.map((p, idx) => {
                          const t1 = p.totalKrwManual ?? Math.round((p.qty || 0) * (p.unitPriceFx || 0) * cex);
                          const t2 = p.totalKrwManual ?? Math.round((p.qty || 0) * (p.unitPriceFx || 0) * wex);
                          return (
                            <div key={p.id} className="grid border-t border-border min-w-[640px]" style={{ gridTemplateColumns: '2fr 1fr 0.7fr 1fr 1.1fr 1.1fr 28px' }}>
                              <input className="px-2 py-1 text-xs bg-transparent border-r border-border focus:outline-none focus:bg-blue-50/50" value={p.name} onChange={e => updateProduct(idx, 'name', e.target.value)} placeholder="품명" />
                              <input className="px-2 py-1 text-xs bg-transparent border-r border-border focus:outline-none focus:bg-blue-50/50" value={p.spec || ''} onChange={e => updateProduct(idx, 'spec', e.target.value)} placeholder="규격/모델" />
                              <input type="number" className="px-2 py-1 text-xs bg-transparent border-r border-border focus:outline-none focus:bg-blue-50/50" value={p.qty || ''} onChange={e => updateProduct(idx, 'qty', Number(e.target.value))} placeholder="0" />
                              <input type="number" className="px-2 py-1 text-xs bg-transparent border-r border-border focus:outline-none focus:bg-blue-50/50" value={p.unitPriceFx || ''} onChange={e => { updateProduct(idx, 'unitPriceFx', Number(e.target.value)); updateProduct(idx, 'totalKrwManual', undefined); }} placeholder="0.00" />
                              <div className="px-2 py-1 text-xs text-muted-foreground border-r border-border">{t1 > 0 ? fmt(t1) : '-'}</div>
                              <div
                                className={cn('px-2 py-1 text-xs border-r border-border font-medium', t2 > 0 ? 'text-blue-700' : 'text-muted-foreground')}
                                title="클릭하여 직접입력"
                                onClick={() => {
                                  const v = prompt('②원가 직접입력 (KRW, 비워두면 자동계산)', p.totalKrwManual?.toString() || '');
                                  if (v === null) return;
                                  updateProduct(idx, 'totalKrwManual', v ? Number(v) : undefined);
                                }}
                              >
                                {t2 > 0 ? fmt(t2) : '-'}
                                {p.totalKrwManual ? <span className="ml-1 text-[10px] text-orange-500">직접</span> : null}
                              </div>
                              <button className="flex items-center justify-center text-muted-foreground hover:text-red-500" onClick={() => removeProduct(idx)}><X className="w-3 h-3" /></button>
                            </div>
                          );
                        })}
                        <div className="grid border-t-2 border-border bg-muted/30 font-semibold text-xs min-w-[640px]" style={{ gridTemplateColumns: '2fr 1fr 0.7fr 1fr 1.1fr 1.1fr 28px' }}>
                          <div className="px-2 py-1.5 col-span-4">소계</div>
                          <div className="px-2 py-1.5 text-muted-foreground">{fmt(totals.productTotal1)}원</div>
                          <div className="px-2 py-1.5 text-blue-700">{fmt(totals.productTotal2)}원</div>
                          <div />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-lg">
                        수입통관 연결 시 제품내역이 자동 입력됩니다. 행 추가로 직접 입력도 가능합니다.
                      </div>
                    )}
                  </div>

                  {/* 상태/메모 */}
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

                  {/* 선지급/지급 */}
                  <div className="rounded-lg border border-border p-3 space-y-1.5">
                    <div className="text-xs font-semibold">정산</div>
                    {[
                      { label: '선지급비용', key: 'advancePayment' as const },
                      { label: '지급액', key: 'paymentAmount' as const },
                      { label: '실지급액', key: 'actualPayment' as const },
                    ].map(({ label, key }) => (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
                        <Input type="number" className="h-7 text-xs flex-1" value={(form[key] as number) || ''} placeholder="0"
                          onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) || 0 }))} />
                        <span className="text-muted-foreground shrink-0 w-4">원</span>
                      </div>
                    ))}
                  </div>

                  {/* 수익 미리보기 */}
                  <ReportBox form={form} totals={totals} />
                </>
              )}

              {/* ── 읽기 모드 ── */}
              {!editing && selected && (
                <>
                  <SettlementTable pa={selected} onUpdated={() => { loadList(searchQ); fetch(`/api/profit-analysis/${selected.id}`).then(r => r.json()).then(j => { if (j.data) setSelected(j.data); }); }} />

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

        {/* ── 링크 패널 ── */}
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
                        <div className="text-[10px] text-muted-foreground">
                          {i.declarationNo || '신고번호 없음'} · {i.releaseDate || ''}
                          {(i.items || []).length > 0 && ` · 제품 ${i.items!.length}종`}
                          {i.exchangeRate ? ` · 환율 ${fmt(i.exchangeRate)}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0 text-xs">
                        {i.duty ? <div className="text-orange-600">관세 {fmt(i.duty)}</div> : null}
                        {i.freightKrw ? <div className="text-muted-foreground">운임 {fmt(i.freightKrw)}</div> : null}
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

function ViewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="text-xs font-semibold">{title}</div>
      {children}
    </div>
  );
}

function SettlementTable({ pa, onUpdated }: { pa: PA; onUpdated: () => void }) {
  const form = paToForm(pa);
  const totals = calcTotals(form);
  const { productTotal2, logisticTotal, profit, profitRate } = totals;
  const cex = pa.customsExRate || 1;
  const wex = pa.wireExRate || cex;

  const [advance, setAdvance] = useState(pa.advancePayment || 0);
  const [actual, setActual] = useState(pa.actualPayment || 0);
  const [saving, setSaving] = useState(false);

  // PA props 갱신 시 state 동기화
  useEffect(() => {
    setAdvance(pa.advancePayment || 0);
    setActual(pa.actualPayment || 0);
  }, [pa.id, pa.advancePayment, pa.actualPayment]);

  // 5. 지급액 = 제품원가② − 선지급비용 (자동계산)
  const paymentCalc = productTotal2 - advance;

  const logisticOnlyCost = (pa.freightCost || 0) + (pa.inlandFreight || 0) + (pa.brokerFee || 0) + (pa.duty || 0) + (pa.wireFee || 0) + (pa.extraCosts || []).reduce((s, c) => s + (c.amount || 0), 0);

  const dateStr = pa.analysisDate
    ? `${new Date(pa.analysisDate).getMonth() + 1}/${new Date(pa.analysisDate).getDate()}`
    : '';

  // 납품월 표기: "YYYY년 MM월 납품분"
  const deliveryLabel = pa.analysisDate
    ? `${pa.analysisDate.slice(0, 4)}년 ${parseInt(pa.analysisDate.slice(5, 7))}월 납품분`
    : '';

  async function savePayments(adv: number, act: number) {
    setSaving(true);
    try {
      await fetch(`/api/profit-analysis/${pa.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...paToForm(pa),
          advancePayment: adv,
          paymentAmount: productTotal2 - adv,
          actualPayment: act,
          updatedBy: 'admin',
          historyAction: '정산입력',
        }),
      });
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  const td = 'border border-gray-400 px-2 py-1.5';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse border border-gray-400 print:text-[11px]" style={{ minWidth: 560 }}>
        <tbody>
          {/* 헤더 */}
          <tr>
            <td colSpan={5} className="border border-gray-400 text-center font-bold py-1.5 text-sm bg-gray-50">
              {pa.customerName ? `${pa.customerName} / ` : ''}수익분석 예상 {pa.analysisDate?.replace(/-/g, '년 ').replace(/-/, '월 ')}{pa.analysisDate ? '일 납품' : ''}
            </td>
          </tr>
          <tr>
            <td colSpan={5} className="border border-gray-400 text-center font-medium py-1 bg-gray-50">{pa.title}</td>
          </tr>
          {/* 컬럼 헤더 */}
          <tr className="bg-gray-100 font-semibold text-center">
            <td className="border border-gray-400 px-2 py-1" style={{ width: '38%' }}></td>
            <td className="border border-gray-400 px-2 py-1" style={{ width: '12%' }}>수량</td>
            <td className="border border-gray-400 px-2 py-1" style={{ width: '22%' }}>KRW</td>
            <td className="border border-gray-400 px-2 py-1" style={{ width: '18%' }}>RMB</td>
            <td className="border border-gray-400 px-2 py-1" style={{ width: '10%' }}>비고</td>
          </tr>

          {/* 1. 매출금액 */}
          <tr className="font-semibold">
            <td className={td}>
              1. 매출금액&nbsp;&nbsp;원
              {deliveryLabel && <span className="ml-2 text-[10px] text-gray-500 font-normal">({deliveryLabel})</span>}
            </td>
            <td className={cn(td, 'text-center')}></td>
            <td className={cn(td, 'text-right')}>{fmt(pa.saleAmount)}</td>
            <td className={td}></td>
            <td className={cn(td, 'text-center text-gray-500 text-[10px]')}>부가세 별도</td>
          </tr>

          {/* 2. 비용 헤더 */}
          <tr className="bg-gray-50">
            <td colSpan={5} className="border border-gray-400 px-2 py-1 font-semibold">2. 비용</td>
          </tr>

          {/* 2-1) 제품공가 */}
          {pa.productItems.length > 0 && (
            <>
              <tr className="bg-gray-50/50">
                <td className="border border-gray-400 px-2 py-1 pl-4 font-medium">
                  2-1) 제품공가{pa.supplierName ? ` ${pa.supplierName}` : ''}
                </td>
                <td className="border border-gray-400 px-2 py-1 text-center text-gray-500">수량</td>
                <td className="border border-gray-400 px-2 py-1"></td>
                <td className="border border-gray-400 px-2 py-1"></td>
                <td className="border border-gray-400 px-2 py-1"></td>
              </tr>
              {/* 환율 표시 행 */}
              {(cex > 1 || wex > 1) && (
                <tr className="text-[10px] text-amber-700 bg-amber-50/40">
                  <td colSpan={5} className="border border-gray-400 px-2 py-0.5 pl-8">
                    적용환율 — ①통관: {fmt(cex)}원/CNY&nbsp;&nbsp;②송금: {wex !== cex ? fmt(wex) : '(①과 동일)'}원/CNY
                    {pa.importBusinessId && <span className="ml-2 text-orange-500">({pa.importBusinessId})</span>}
                  </td>
                </tr>
              )}
              {pa.productItems.map((p, i) => {
                const t1 = p.totalKrwManual ?? Math.round((p.qty || 0) * (p.unitPriceFx || 0) * cex);
                const rmbAmt = p.totalKrwManual ? null : ((p.qty || 0) * (p.unitPriceFx || 0));
                return (
                  <tr key={i}>
                    <td className="border border-gray-400 px-2 py-1 pl-6">
                      <span className="text-gray-400 mr-2 text-[10px]">{dateStr}</span>{p.name}{p.spec ? ` ${p.spec}` : ''}
                    </td>
                    <td className="border border-gray-400 px-2 py-1 text-center text-gray-600">{(p.qty || 0).toLocaleString()}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">{t1 > 0 ? fmt(t1) : '-'}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right text-gray-600">
                      {rmbAmt != null ? `¥ ${rmbAmt.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="border border-gray-400 px-2 py-1"></td>
                  </tr>
                );
              })}
              {/* 제품원가 소계 — 열 형식 동일, 하이라이트 */}
              <tr className="bg-yellow-50 font-semibold text-gray-700">
                <td className="border border-gray-400 px-2 py-1 pl-6">제품원가 소계 (②송금환율 기준)</td>
                <td className="border border-gray-400 px-2 py-1 text-center"></td>
                <td className="border border-gray-400 px-2 py-1 text-right">{fmt(productTotal2)}</td>
                <td className="border border-gray-400 px-2 py-1 text-right text-gray-500">
                  {pa.productItems.reduce((s, p) => s + (p.totalKrwManual ? 0 : (p.qty || 0) * (p.unitPriceFx || 0)), 0) > 0
                    ? `¥ ${pa.productItems.reduce((s, p) => s + (p.totalKrwManual ? 0 : (p.qty || 0) * (p.unitPriceFx || 0)), 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : ''}
                </td>
                <td className="border border-gray-400 px-2 py-1"></td>
              </tr>
            </>
          )}

          {/* 빈 행 */}
          <tr><td colSpan={5} className="border border-gray-400 py-1"></td></tr>

          {/* 2) 비용 합계 행 */}
          <tr className="font-semibold bg-gray-50/50">
            <td className="border border-gray-400 px-2 py-1.5 pl-4">2) 비용 합계</td>
            <td className="border border-gray-400 px-2 py-1.5"></td>
            <td className="border border-gray-400 px-2 py-1.5 text-right">{fmt(logisticOnlyCost)}</td>
            <td className="border border-gray-400 px-2 py-1.5"></td>
            <td className="border border-gray-400 px-2 py-1.5 text-center text-gray-500 text-[10px]">부가세 제외</td>
          </tr>

          {/* 물류비용 상세 */}
          {[
            { label: '포워더운임', val: pa.freightCost },
            { label: '내륙운송료', val: pa.inlandFreight },
            { label: '통관수수료', val: pa.brokerFee },
            { label: '관세', val: pa.duty },
            { label: '해외송금수수료', val: pa.wireFee },
          ].map(({ label, val }) => (
            <tr key={label}>
              <td className="border border-gray-400 px-2 py-1 pl-8 text-gray-700">{label}</td>
              <td className="border border-gray-400 px-2 py-1"></td>
              <td className="border border-gray-400 px-2 py-1 text-right">{val > 0 ? fmt(val) : ''}</td>
              <td className="border border-gray-400 px-2 py-1"></td>
              <td className="border border-gray-400 px-2 py-1"></td>
            </tr>
          ))}
          {(pa.extraCosts || []).filter(c => c.amount > 0).map((c, i) => (
            <tr key={i}>
              <td className="border border-gray-400 px-2 py-1 pl-8 text-gray-700">{c.name}</td>
              <td className="border border-gray-400 px-2 py-1"></td>
              <td className="border border-gray-400 px-2 py-1 text-right">{fmt(c.amount)}</td>
              <td className="border border-gray-400 px-2 py-1"></td>
              <td className="border border-gray-400 px-2 py-1"></td>
            </tr>
          ))}
          {/* 부가세 — 별도/불포함 명시 */}
          {pa.vatImport > 0 && (
            <tr className="text-gray-500 italic">
              <td className="border border-gray-400 px-2 py-1 pl-8">부가세 (별도)</td>
              <td className="border border-gray-400 px-2 py-1"></td>
              <td className="border border-gray-400 px-2 py-1 text-right">{fmt(pa.vatImport)}</td>
              <td className="border border-gray-400 px-2 py-1"></td>
              <td className="border border-gray-400 px-2 py-1 text-center text-[10px]">별도/불포함</td>
            </tr>
          )}

          {/* 빈 행 */}
          <tr><td colSpan={5} className="border border-gray-400 py-1"></td></tr>

          {/* 3. 수익 */}
          <tr className={cn('font-bold', profit >= 0 ? 'bg-blue-50' : 'bg-red-50')}>
            <td className="border border-gray-400 px-2 py-2">3. 수익</td>
            <td className="border border-gray-400 px-2 py-2"></td>
            <td className={cn('border border-gray-400 px-2 py-2 text-right text-base', profit >= 0 ? 'text-blue-700' : 'text-red-700')}>
              {profit >= 0 ? '' : '-'}{fmt(Math.abs(profit))}
            </td>
            <td className="border border-gray-400 px-2 py-2"></td>
            <td className="border border-gray-400 px-2 py-2 text-center text-gray-500 text-[10px]">부가세 별도</td>
          </tr>
          <tr className={profit >= 0 ? 'bg-blue-50/50' : 'bg-red-50/50'}>
            <td className="border border-gray-400 px-2 py-1 text-right pr-4 text-gray-600 font-medium">{profitRate.toFixed(2)}</td>
            <td className="border border-gray-400 px-2 py-1 text-gray-600">수익률 %</td>
            <td className="border border-gray-400 px-2 py-1 text-[10px] text-gray-400" colSpan={3}>
              매출 {fmt(pa.saleAmount)} − 총비용(제품원가+물류) {fmt(productTotal2 + logisticOnlyCost)}
            </td>
          </tr>

          {/* 빈 행 */}
          <tr><td colSpan={5} className="border border-gray-400 py-1"></td></tr>

          {/* 4. 선지급비용 — 인라인 편집 */}
          <tr>
            <td className="border border-gray-400 px-2 py-1.5 font-semibold">4. 선지급비용</td>
            <td className="border border-gray-400 px-2 py-1.5 text-center text-[10px] text-gray-400">보증금 등</td>
            <td className="border border-gray-400 px-1 py-1" colSpan={2}>
              <input
                type="number"
                className="w-full h-6 px-2 text-xs text-right bg-yellow-50 border border-yellow-300 rounded focus:outline-none focus:ring-1 focus:ring-yellow-400"
                value={advance || ''}
                placeholder="0"
                onChange={e => setAdvance(Number(e.target.value) || 0)}
                onBlur={() => savePayments(advance, actual)}
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-center text-[10px] text-gray-400">{saving ? '저장중…' : '원'}</td>
          </tr>

          {/* 5. 지급액 — 자동계산 (제품원가② − 선지급비용) */}
          <tr>
            <td className="border border-gray-400 px-2 py-1.5 font-semibold">
              5. 지급액
              <span className="ml-1 text-[10px] text-gray-400 font-normal">(제품원가②−선지급)</span>
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-center text-[10px] text-gray-400">자동계산</td>
            <td className="border border-gray-400 px-2 py-1.5 text-right font-semibold" colSpan={2}>
              {productTotal2 > 0 ? fmt(paymentCalc) : <span className="text-gray-400 font-normal text-xs">제품원가 입력 필요</span>}
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-center text-[10px] text-gray-400">원</td>
          </tr>

          {/* 6. 실지급액 — 직접 입력 (환율 차이로 실제 송금액 다름) */}
          <tr className="bg-orange-50/60 font-semibold">
            <td className="border border-gray-400 px-2 py-1.5">6. 실지급액</td>
            <td className="border border-gray-400 px-2 py-1.5 text-center text-[10px] text-gray-400">실송금액</td>
            <td className="border border-gray-400 px-1 py-1" colSpan={2}>
              <input
                type="number"
                className="w-full h-6 px-2 text-xs text-right bg-yellow-50 border border-yellow-300 rounded focus:outline-none focus:ring-1 focus:ring-yellow-400 font-normal"
                value={actual || ''}
                placeholder="실제 송금액 입력"
                onChange={e => setActual(Number(e.target.value) || 0)}
                onBlur={() => savePayments(advance, actual)}
              />
            </td>
            <td className="border border-gray-400 px-2 py-1.5 text-center text-[10px] text-gray-400">{saving ? '저장중…' : '원'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ReportBox({ form, totals }: { form: FormState; totals: ReturnType<typeof calcTotals> }) {
  const { productTotal1, productTotal2, logisticTotal, totalCost, profit, profitRate } = totals;
  const saleKrw = form.saleAmount || 0;
  const logisticOnlyCost = (form.freightCost || 0) + (form.inlandFreight || 0) + (form.brokerFee || 0) + (form.duty || 0) + (form.wireFee || 0) + (form.extraCosts || []).reduce((s, c) => s + (c.amount || 0), 0);
  const extraTotal = (form.extraCosts || []).reduce((s, c) => s + (c.amount || 0), 0);

  const costRows: { label: string; tag: string; val: number; sub?: boolean }[] = [
    { label: '제품원가 (②송금환율 기준)', tag: 'B-1', val: productTotal2 },
    { label: '포워더 운임 (해상+부대비용)', tag: 'B-2', val: form.freightCost || 0 },
    ...(form.inlandFreight ? [{ label: '내륙운송료', tag: 'B-3', val: form.inlandFreight }] : []),
    ...(form.brokerFee ? [{ label: '통관수수료', tag: 'B-4', val: form.brokerFee }] : []),
    ...(form.duty ? [{ label: '관세', tag: 'B-5', val: form.duty }] : []),
    ...(extraTotal > 0 ? [{ label: '기타비용', tag: 'B-6', val: extraTotal }] : []),
    ...(form.wireFee ? [{ label: '해외송금수수료', tag: 'B-7', val: form.wireFee }] : []),
  ].filter(r => r.val > 0);

  const tagList = costRows.map(r => r.tag).join('+');

  return (
    <div className={cn('rounded-xl border-2 p-4 space-y-3 print:border print:shadow-none', profit >= 0 ? 'border-blue-300 bg-blue-50/50' : 'border-red-300 bg-red-50/50')}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-muted-foreground tracking-wider">수익분석 레포트</div>
        <div className="text-[10px] text-muted-foreground font-mono">수익 = [A] - ({tagList})</div>
      </div>

      <div className="divide-y divide-border/60 text-xs">
        {/* 매출 */}
        <div className="flex justify-between items-center py-1.5">
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] bg-blue-100 text-blue-700 px-1 rounded">A</span>
            <span className="font-medium">매출금액</span>
          </span>
          <span className="font-semibold">{fmt(saleKrw)}원</span>
        </div>

        {/* 비용 항목 */}
        <div className="py-1.5 space-y-1">
          <div className="text-[11px] text-muted-foreground font-medium mb-1">B. 비용 합계</div>
          {costRows.map(r => (
            <div key={r.tag} className="flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] bg-gray-100 text-gray-600 px-1 rounded">{r.tag}</span>
                <span className="text-muted-foreground">{r.label}</span>
              </span>
              <span>- {fmt(r.val)}원</span>
            </div>
          ))}
          {productTotal1 > 0 && productTotal1 !== productTotal2 && (
            <div className="text-[10px] text-muted-foreground pl-10">※ 제품원가① (통관환율 기준) {fmt(productTotal1)}원</div>
          )}
          <div className="flex justify-between font-semibold border-t border-border/60 pt-1 mt-1">
            <span>비용 합계</span>
            <span>- {fmt(totalCost)}원</span>
          </div>
        </div>
      </div>

      {/* 수익 */}
      <div className={cn('rounded-lg p-3 flex items-center justify-between', profit >= 0 ? 'bg-blue-100' : 'bg-red-100')}>
        <div>
          <div className="text-[11px] text-muted-foreground">수익  [A] - [B]</div>
          <div className="text-xs text-muted-foreground font-mono mt-0.5">
            {fmt(saleKrw)} - {fmt(totalCost)}
          </div>
          <div className={cn('text-xl font-bold mt-1', profit >= 0 ? 'text-blue-700' : 'text-red-700')}>
            {profit >= 0 ? '+' : ''}{fmt(profit)}원
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">수익률</div>
          <div className={cn('text-2xl font-bold', profit >= 0 ? 'text-blue-700' : 'text-red-700')}>
            {profitRate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* 수입부가세 참고 */}
      {form.vatImport > 0 && (
        <div className="text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1.5 border border-gray-200">
          * 참고: 수입부가세 {fmt(form.vatImport)}원 (매입세액공제 환급대상 — 위 비용에 미포함)
        </div>
      )}
    </div>
  );
}
