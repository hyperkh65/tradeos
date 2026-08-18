'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, X, HelpCircle, CheckCircle, AlertCircle, ChevronDown, Search, BookOpen, Scale, TrendingUp, FileText, Loader2, Link2, Zap, Package } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Account {
  id: string; code: string; name: string; type: string;
  normal_balance: string; group_name: string; description: string;
}

interface JournalLine {
  id?: string; line_no?: number; account_code: string; account_name: string;
  debit: number; credit: number; currency: string; fx_rate: number; memo: string;
}

interface JournalEntry {
  id: string; entry_no: string; entry_date: string; entry_type: string;
  description: string; status: string; related_ref?: string;
  debit_total: number; credit_total: number; created_at: string;
  lines: JournalLine[];
}

interface AccountBalance {
  account_code: string;
  account_name: string;
  type: string;
  normal_balance: string;
  group_name: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTRY_TYPES = [
  { value: 'expense', label: '경비지출', color: 'bg-orange-100 text-orange-700' },
  { value: 'revenue', label: '매출발생', color: 'bg-green-100 text-green-700' },
  { value: 'receipt', label: '대금수령', color: 'bg-blue-100 text-blue-700' },
  { value: 'salary', label: '급여지급', color: 'bg-purple-100 text-purple-700' },
  { value: 'purchase', label: '매입발생', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'import_cost', label: '수입원가', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'sale_full', label: '매출+원가', color: 'bg-teal-100 text-teal-700' },
  { value: 'adjust', label: '결산조정', color: 'bg-gray-100 text-gray-700' },
  { value: 'other', label: '기타', color: 'bg-slate-100 text-slate-700' },
];

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  posted: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-600',
};
const STATUS_LABELS: Record<string, string> = { draft: '임시', posted: '확정', void: '취소' };

const TYPE_GUIDES: Record<string, { tip: string; example: string }> = {
  expense: {
    tip: '차변=비용계정(5xxx), 대변=보통예금(1020) 또는 미지급금(2020)',
    example: '예) 해상운임 100만원 지급 → 차변: 해상운임 1,000,000 / 대변: 보통예금 1,000,000',
  },
  revenue: {
    tip: '차변=외상매출금(1040) 또는 보통예금(1020), 대변=매출(4010/4020)',
    example: '예) 거래처에 외상 판매 → 차변: 외상매출금 / 대변: 국내매출',
  },
  receipt: {
    tip: '차변=보통예금(1020), 대변=외상매출금(1040)',
    example: '예) 거래처 외상대금 수령 → 차변: 보통예금 / 대변: 외상매출금',
  },
  salary: {
    tip: '차변=급여(5110), 대변=보통예금(1020)+예수금(2040)',
    example: '예) 급여 300만원 지급, 4대보험 30만원 공제 → 차변: 급여 300 / 대변: 보통예금 270+예수금 30',
  },
  purchase: {
    tip: '차변=재고자산(1090) 또는 비용계정, 대변=외상매입금(2010)',
    example: '예) 상품 500만원 외상 구입 → 차변: 재고자산 500 / 대변: 외상매입금 500',
  },
  adjust: {
    tip: '감가상각, 선급비용 배분, 충당금 설정 등 결산 시 조정 분개',
    example: '예) 감가상각비 인식 → 차변: 감가상각비 / 대변: 감가상각누계액',
  },
  import_cost: {
    tip: '수입통관 시 재고자산 취득 (DDP 원가 기준). 원가계산기 연동으로 자동 생성 가능.',
    example: '예) 통관 DDP원가 5,000,000원 → 차변: 재고자산 5,000,000 / 대변: 외상매입금 5,000,000',
  },
  sale_full: {
    tip: '매출 발생 + 매출원가 동시 인식 (복합분개). 원가계산기 연동으로 자동 생성 가능.',
    example: '예) 매출 8백만, 원가 5백만 → 차변: 외상매출금8M+매출원가5M / 대변: 국내매출8M+재고자산5M',
  },
  other: {
    tip: '위 유형에 해당하지 않는 기타 거래',
    example: '예) 자본금 납입, 차입금 상환 등',
  },
};

const TEMPLATES: Record<string, Partial<JournalLine>[]> = {
  expense: [
    { account_code: '5290', account_name: '잡비', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '1020', account_name: '보통예금', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
  ],
  revenue: [
    { account_code: '1040', account_name: '외상매출금', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '4010', account_name: '국내매출', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
  ],
  receipt: [
    { account_code: '1020', account_name: '보통예금', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '1040', account_name: '외상매출금', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
  ],
  salary: [
    { account_code: '5110', account_name: '급여', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '1020', account_name: '보통예금', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '2040', account_name: '예수금', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
  ],
  purchase: [
    { account_code: '1090', account_name: '재고자산', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '2010', account_name: '외상매입금', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
  ],
  import_cost: [
    { account_code: '1090', account_name: '재고자산', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '2010', account_name: '외상매입금', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
  ],
  sale_full: [
    { account_code: '1040', account_name: '외상매출금', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '5010', account_name: '매출원가', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '4010', account_name: '국내매출', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '1090', account_name: '재고자산', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
  ],
  adjust: [
    { account_code: '5280', account_name: '감가상각비', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '1350', account_name: '감가상각누계액', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
  ],
  other: [
    { account_code: '', account_name: '', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
    { account_code: '', account_name: '', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '' },
  ],
};

// T계정 좌(차변)/우(대변) 사이드 기본값
const TEMPLATE_SIDES: Record<string, ('debit' | 'credit')[]> = {
  expense: ['debit', 'credit'],
  revenue: ['debit', 'credit'],
  receipt: ['debit', 'credit'],
  salary: ['debit', 'credit', 'credit'],
  purchase: ['debit', 'credit'],
  import_cost: ['debit', 'credit'],
  sale_full: ['debit', 'debit', 'credit', 'credit'],
  adjust: ['debit', 'credit'],
  other: ['debit', 'credit'],
};

const CONTAINER_CBM: Record<string, number> = { '20ft': 27, '40ft': 56, '40HQ': 68 };

interface EstimatorCaseSummary {
  id: string; name: string; containerType: string;
  fxUsd: number; fxRmb: number; fxUsdSell: number; fxRmbSell: number;
  dutyRate: number; eprRate: number; eprObligationRate: number;
  freightSeaUsd?: number; freightSea: number; freightInland: number; freightPort: number; freightMisc: number;
  portFrom?: string; portTo?: string;
  customsNo?: string; salesNo?: string;
  items: Array<{
    id: string; name: string; currency: string; sellingCurrency?: string;
    fobPrice: number; boxL: number; boxW: number; boxH: number; qtyPerBox: number;
    weightG?: number; certs?: Array<{ totalCostKrw: number; shipQty: number }>;
    dutyRateOverride?: number; sellingPrice?: number;
  }>;
}

function calcItemDdp(item: EstimatorCaseSummary['items'][0], c: EstimatorCaseSummary) {
  const fxUsd = c.fxUsd || 1430;
  const fxRmb = c.fxRmb || 195;
  const containerCbm = CONTAINER_CBM[c.containerType] || 56;
  const fobUsd = item.currency === 'CNY' ? item.fobPrice * (fxRmb / fxUsd) : item.fobPrice;
  const cbmPerBox = (item.boxL * item.boxW * item.boxH) / 1_000_000_000;
  const qtyPerContainer = cbmPerBox > 0 ? Math.floor(containerCbm / cbmPerBox) * item.qtyPerBox : 0;
  const seaKrw = c.freightSeaUsd != null ? c.freightSeaUsd * fxUsd : c.freightSea;
  const seaPerUnitUsd = qtyPerContainer > 0 ? seaKrw / qtyPerContainer / fxUsd : 0;
  const otherKrw = c.freightInland + c.freightPort + c.freightMisc;
  const otherPerUnitKrw = qtyPerContainer > 0 ? otherKrw / qtyPerContainer : 0;
  const cifUsd = fobUsd + seaPerUnitUsd;
  const dutyRate = item.dutyRateOverride ?? c.dutyRate;
  const dutyPerUnitUsd = cifUsd * dutyRate;
  const eprPerUnitKrw = ((item.weightG || 0) / 1000) * (c.eprObligationRate ?? 0.20) * (c.eprRate || 0);
  const certPerUnitKrw = (item.certs || []).reduce((s, cert) => s + (cert.shipQty > 0 ? cert.totalCostKrw / cert.shipQty : 0), 0);
  return {
    ddpKrw: (cifUsd + dutyPerUnitUsd) * fxUsd + otherPerUnitKrw + eprPerUnitKrw + certPerUnitKrw,
    qtyPerContainer,
  };
}

const TYPE_COLORS: Record<string, string> = {
  expense: 'bg-orange-100 text-orange-700',
  revenue: 'bg-green-100 text-green-700',
  receipt: 'bg-blue-100 text-blue-700',
  salary: 'bg-purple-100 text-purple-700',
  purchase: 'bg-yellow-100 text-yellow-700',
  adjust: 'bg-gray-100 text-gray-700',
  other: 'bg-slate-100 text-slate-700',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₩' + Math.round(n).toLocaleString('ko-KR');
}

function fmtNum(n: number) {
  return Math.round(n).toLocaleString('ko-KR');
}

function typeLabel(v: string) {
  return ENTRY_TYPES.find(t => t.value === v)?.label || v;
}

// ─── AccountCombobox ──────────────────────────────────────────────────────────

function AccountCombobox({
  accounts, value, onChange
}: {
  accounts: Account[];
  value: string;
  onChange: (code: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = accounts.find(a => a.code === value);

  const filtered = useMemo(() => {
    if (!query) return accounts;
    const q = query.toLowerCase();
    return accounts.filter(a =>
      a.code.includes(q) || a.name.toLowerCase().includes(q) || (a.group_name || '').includes(q)
    );
  }, [accounts, query]);

  const typeColors: Record<string, string> = {
    asset: 'bg-blue-50 text-blue-700',
    liability: 'bg-red-50 text-red-700',
    equity: 'bg-purple-50 text-purple-700',
    revenue: 'bg-green-50 text-green-700',
    expense: 'bg-orange-50 text-orange-700',
  };
  const typeKo: Record<string, string> = {
    asset: '자산', liability: '부채', equity: '자본', revenue: '수익', expense: '비용',
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        className="w-full h-8 px-2 text-left text-xs border border-input rounded-md bg-background flex items-center justify-between gap-1 hover:bg-muted/30"
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? `${selected.code} ${selected.name}` : '계정 선택...'}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
      </button>
      {selected && (
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{selected.description}</p>
      )}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-72 bg-background border border-input rounded-lg shadow-xl">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                className="w-full h-7 pl-7 pr-2 text-xs border border-input rounded-md bg-background"
                placeholder="코드 또는 계정명 검색..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground p-3 text-center">결과 없음</p>
            )}
            {filtered.map(a => (
              <button
                key={a.code}
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-muted/50 flex items-center gap-2"
                onClick={() => { onChange(a.code, a.name); setOpen(false); setQuery(''); }}
              >
                <span className="text-xs text-muted-foreground w-10 shrink-0 font-mono">{a.code}</span>
                <span className="text-xs flex-1">{a.name}</span>
                <span className={cn('text-xs px-1 rounded shrink-0', typeColors[a.type] || 'bg-gray-50 text-gray-600')}>
                  {typeKo[a.type] || a.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── JournalEntryModal ────────────────────────────────────────────────────────

function JournalEntryModal({
  accounts, entry, onClose, onSave,
}: {
  accounts: Account[];
  entry?: JournalEntry | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const initType = entry?.entry_type || 'expense';

  const blankLine = (): JournalLine => ({
    account_code: '', account_name: '', debit: 0, credit: 0, currency: 'KRW', fx_rate: 1, memo: '',
  });

  const [form, setForm] = useState({
    entry_type: initType,
    entry_date: entry?.entry_date || today,
    description: entry?.description || '',
    related_ref: entry?.related_ref || '',
    status: entry?.status || 'posted',
  });

  const initLines = entry?.lines?.length
    ? entry.lines.map(l => ({ ...l }))
    : (TEMPLATES[initType] || [blankLine(), blankLine()]).map(t => ({ ...blankLine(), ...t }));
  const initSides: ('debit' | 'credit')[] = entry?.lines?.length
    ? entry.lines.map(l => (l.credit > 0 && l.debit === 0 ? 'credit' : 'debit'))
    : (TEMPLATE_SIDES[initType] || ['debit', 'credit']);

  const [lines, setLines] = useState<JournalLine[]>(initLines);
  const [sides, setSides] = useState<('debit' | 'credit')[]>(initSides);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showGuide, setShowGuide] = useState(true);

  // 원가계산기 연동 state
  const [showCaseLink, setShowCaseLink] = useState(false);
  const [cases, setCases] = useState<EstimatorCaseSummary[]>([]);
  const [caseSearch, setCaseSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState<EstimatorCaseSummary | null>(null);
  const [autoQtys, setAutoQtys] = useState<Record<string, number>>({});
  const [autoType, setAutoType] = useState<'import' | 'sale'>('import');
  const [casesLoading, setCasesLoading] = useState(false);

  const debitTotal = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const creditTotal = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const diff = Math.round((debitTotal - creditTotal) * 100) / 100;
  const balanced = diff === 0 && debitTotal > 0;

  // 케이스 목록 로드
  useEffect(() => {
    if (!showCaseLink || cases.length > 0) return;
    setCasesLoading(true);
    fetch('/api/estimator').then(r => r.json()).then(d => {
      setCases(Array.isArray(d.data) ? d.data : []);
    }).finally(() => setCasesLoading(false));
  }, [showCaseLink, cases.length]);

  const filteredCases = useMemo(() => {
    const q = caseSearch.toLowerCase();
    if (!q) return cases.slice(0, 8);
    return cases.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.customsNo || '').toLowerCase().includes(q) ||
      (c.salesNo || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [cases, caseSearch]);

  const handleTypeChange = (type: string) => {
    setForm(f => ({ ...f, entry_type: type }));
    const tmpl = TEMPLATES[type] || [blankLine(), blankLine()];
    setLines(tmpl.map(t => ({ ...blankLine(), ...t })));
    setSides(TEMPLATE_SIDES[type] || Array.from({ length: tmpl.length }, (_, i) => i === 0 ? 'debit' : 'credit'));
  };

  const updateLine = (i: number, field: keyof JournalLine, val: string | number) => {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  };

  const addDebitLine = () => {
    setLines(ls => [...ls, blankLine()]);
    setSides(s => [...s, 'debit']);
  };
  const addCreditLine = () => {
    setLines(ls => [...ls, blankLine()]);
    setSides(s => [...s, 'credit']);
  };
  const removeLine = (i: number) => {
    if (lines.length <= 2) return;
    setLines(ls => ls.filter((_, idx) => idx !== i));
    setSides(s => s.filter((_, idx) => idx !== i));
  };

  const applyTemplate = () => {
    const tmpl = TEMPLATES[form.entry_type] || [blankLine(), blankLine()];
    setLines(tmpl.map(t => ({ ...blankLine(), ...t })));
    setSides(TEMPLATE_SIDES[form.entry_type] || ['debit', 'credit']);
  };

  // 원가계산기 케이스 선택
  const selectCase = (c: EstimatorCaseSummary) => {
    setSelectedCase(c);
    const qtys: Record<string, number> = {};
    for (const item of c.items) {
      const { qtyPerContainer } = calcItemDdp(item, c);
      qtys[item.id] = qtyPerContainer;
    }
    setAutoQtys(qtys);
  };

  // 자동분개 생성
  const generateLines = () => {
    if (!selectedCase) return;
    const newLines: JournalLine[] = [];
    const newSides: ('debit' | 'credit')[] = [];

    if (autoType === 'import') {
      let totalDdp = 0;
      for (const item of selectedCase.items) {
        const qty = autoQtys[item.id] || 0;
        const { ddpKrw } = calcItemDdp(item, selectedCase);
        totalDdp += ddpKrw * qty;
      }
      newLines.push(
        { account_code: '1090', account_name: '재고자산', debit: Math.round(totalDdp), credit: 0, currency: 'KRW', fx_rate: 1, memo: 'DDP원가 기준 수입원가' },
        { account_code: '2010', account_name: '외상매입금', debit: 0, credit: Math.round(totalDdp), currency: 'KRW', fx_rate: 1, memo: '공급업체 외상 매입' },
      );
      newSides.push('debit', 'credit');
      setForm(f => ({
        ...f, entry_type: 'import_cost',
        description: f.description || `${selectedCase.name} 수입원가 (통관)`,
        related_ref: f.related_ref || (selectedCase.customsNo || ''),
      }));
    } else {
      let totalSell = 0;
      let totalDdp = 0;
      for (const item of selectedCase.items) {
        const qty = autoQtys[item.id] || 0;
        const { ddpKrw } = calcItemDdp(item, selectedCase);
        totalDdp += ddpKrw * qty;
        if (item.sellingPrice && qty > 0) {
          const sc = item.sellingCurrency || 'USD';
          let sellKrw = item.sellingPrice;
          if (sc === 'USD') sellKrw = item.sellingPrice * selectedCase.fxUsdSell;
          else if (sc === 'CNY') sellKrw = item.sellingPrice * selectedCase.fxRmbSell;
          totalSell += sellKrw * qty;
        }
      }
      newLines.push(
        { account_code: '1040', account_name: '외상매출금', debit: Math.round(totalSell), credit: 0, currency: 'KRW', fx_rate: 1, memo: '매출채권 발생' },
        { account_code: '5010', account_name: '매출원가', debit: Math.round(totalDdp), credit: 0, currency: 'KRW', fx_rate: 1, memo: 'DDP원가 기준' },
        { account_code: '4010', account_name: '국내매출', debit: 0, credit: Math.round(totalSell), currency: 'KRW', fx_rate: 1, memo: '' },
        { account_code: '1090', account_name: '재고자산', debit: 0, credit: Math.round(totalDdp), currency: 'KRW', fx_rate: 1, memo: '원가 대체' },
      );
      newSides.push('debit', 'debit', 'credit', 'credit');
      setForm(f => ({
        ...f, entry_type: 'sale_full',
        description: f.description || `${selectedCase.name} 매출 (복합분개)`,
        related_ref: f.related_ref || (selectedCase.salesNo || ''),
      }));
    }

    setLines(newLines);
    setSides(newSides);
    setShowCaseLink(false);
    setSelectedCase(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.description.trim()) { setError('적요를 입력하세요.'); return; }
    if (!form.entry_date) { setError('전표일자를 입력하세요.'); return; }
    if (lines.some(l => !l.account_code)) { setError('모든 행의 계정과목을 선택해 주세요.'); return; }
    if (!balanced) { setError(`차변과 대변이 일치하지 않습니다 (차액: ${fmtNum(Math.abs(diff))}원)`); return; }

    setSaving(true);
    try {
      const body = { ...form, lines };
      const res = await fetch(entry ? `/api/accounting/journals/${entry.id}` : '/api/accounting/journals', {
        method: entry ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('저장 실패');
      setSuccess('저장되었습니다.');
      setTimeout(() => { onSave(); onClose(); }, 800);
    } catch (err) {
      setError((err as Error).message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const guide = TYPE_GUIDES[form.entry_type];
  const debitLineItems = lines.map((l, i) => ({ line: l, idx: i })).filter((_, i) => sides[i] === 'debit');
  const creditLineItems = lines.map((l, i) => ({ line: l, idx: i })).filter((_, i) => sides[i] === 'credit');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {entry ? '전표 수정' : '새 전표 등록'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-4 space-y-4">

            {/* 원가계산기 연동 패널 */}
            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCaseLink(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/30 bg-muted/10"
              >
                <Link2 className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-blue-700 font-semibold">원가계산기 연동</span>
                <span className="text-muted-foreground font-normal">— 통관번호·매출번호로 분개 자동생성</span>
                <ChevronDown className={cn('w-3.5 h-3.5 ml-auto transition-transform', showCaseLink && 'rotate-180')} />
              </button>

              {showCaseLink && (
                <div className="p-3 border-t bg-blue-50/30 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      className="w-full h-8 pl-8 pr-3 text-xs border border-input rounded-md bg-background"
                      placeholder="케이스명 / 통관번호 / 매출번호 검색..."
                      value={caseSearch}
                      onChange={e => setCaseSearch(e.target.value)}
                    />
                  </div>

                  {casesLoading ? (
                    <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {filteredCases.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCase(c)}
                          className={cn(
                            'w-full text-left px-3 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors',
                            selectedCase?.id === c.id
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'hover:bg-muted/50 border border-transparent'
                          )}
                        >
                          <Package className="w-3 h-3 shrink-0 text-muted-foreground" />
                          <span className="flex-1 font-medium truncate">{c.name}</span>
                          {c.portFrom && c.portTo && (
                            <span className="text-muted-foreground shrink-0">{c.portFrom}→{c.portTo}</span>
                          )}
                          <span className="text-muted-foreground shrink-0">{c.items.length}개 품목</span>
                        </button>
                      ))}
                      {filteredCases.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3">케이스가 없습니다. 먼저 원가계산기에서 케이스를 만들어 주세요.</p>
                      )}
                    </div>
                  )}

                  {selectedCase && (
                    <div className="border rounded-lg bg-background p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{selectedCase.name}</span>
                        <button type="button" onClick={() => setSelectedCase(null)} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 품목별 수량 */}
                      <div className="space-y-1.5">
                        {selectedCase.items.map(item => {
                          const { ddpKrw, qtyPerContainer } = calcItemDdp(item, selectedCase);
                          return (
                            <div key={item.id} className="flex items-center gap-2">
                              <span className="text-xs flex-1 truncate">{item.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">DDP {fmtNum(Math.round(ddpKrw))}원</span>
                              {item.sellingPrice && (
                                <span className="text-xs text-green-600 shrink-0">
                                  판매 {item.sellingCurrency || 'USD'} {item.sellingPrice}
                                </span>
                              )}
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs text-muted-foreground">수량</span>
                                <input
                                  type="number"
                                  min="0"
                                  className="w-20 h-6 text-xs text-right border rounded-md px-1.5 bg-background"
                                  value={autoQtys[item.id] ?? qtyPerContainer}
                                  onChange={e => setAutoQtys(q => ({ ...q, [item.id]: Number(e.target.value) || 0 }))}
                                />
                                <span className="text-xs text-muted-foreground">개</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 분개 유형 */}
                      <div className="flex gap-4 pt-1">
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="radio" checked={autoType === 'import'} onChange={() => setAutoType('import')} />
                          <span className="font-medium">수입원가분개</span>
                          <span className="text-muted-foreground">(재고자산↑ / 외상매입금↑)</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="radio" checked={autoType === 'sale'} onChange={() => setAutoType('sale')} />
                          <span className="font-medium">매출분개(복합)</span>
                          <span className="text-muted-foreground">(외상매출금+원가 / 매출+재고↓)</span>
                        </label>
                      </div>

                      <Button type="button" size="sm" onClick={generateLines} className="w-full h-8 text-xs gap-1.5">
                        <Zap className="w-3.5 h-3.5" /> 분개 자동생성
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Type selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">전표유형 *</label>
              <div className="flex flex-wrap gap-2">
                {ENTRY_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => handleTypeChange(t.value)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                      form.entry_type === t.value
                        ? t.color + ' border-current ring-1 ring-current'
                        : 'border-input text-muted-foreground hover:border-muted-foreground'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {guide && showGuide && (
                <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg relative">
                  <button type="button" onClick={() => setShowGuide(false)} className="absolute top-1.5 right-1.5 text-blue-300 hover:text-blue-500">
                    <X className="w-3 h-3" />
                  </button>
                  <p className="text-xs text-blue-700 font-medium">{guide.tip}</p>
                  <p className="text-xs text-blue-500 mt-0.5">{guide.example}</p>
                </div>
              )}
            </div>

            {/* Basic fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">전표일자 *</label>
                <Input type="date" value={form.entry_date}
                  onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} required className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="posted">확정</option>
                  <option value="draft">임시저장</option>
                  <option value="void">취소</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  적요 (내용) *
                </label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="예: 11월 해상운임 지급, 거래처 매출 발생..." required className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  통관번호 / 매출번호
                  <span className="ml-1 text-muted-foreground/60 font-normal">— 인보이스, 수입신고번호 등</span>
                </label>
                <Input value={form.related_ref} onChange={e => setForm(f => ({ ...f, related_ref: e.target.value }))}
                  placeholder="INV-2026-001 / 수입신고번호..." className="h-9 text-sm" />
              </div>
            </div>

            {/* ── T계정 분개 편집기 ─────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">
                  분개 — T계정 형식
                  <span className="ml-1 font-normal text-muted-foreground/60">(차변 합계 = 대변 합계여야 합니다)</span>
                </label>
                <button type="button" onClick={applyTemplate} className="text-xs text-muted-foreground hover:text-blue-600 underline">
                  템플릿 적용
                </button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                {/* T계정 헤더 */}
                <div className="grid grid-cols-2 divide-x">
                  <div className="bg-blue-50 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-800">차변 (Debit)</span>
                    <span className={cn('text-sm font-bold tabular-nums', debitTotal > 0 ? 'text-blue-800' : 'text-muted-foreground')}>
                      {fmtNum(debitTotal)}
                    </span>
                  </div>
                  <div className="bg-red-50 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-red-800">대변 (Credit)</span>
                    <span className={cn('text-sm font-bold tabular-nums', creditTotal > 0 ? 'text-red-800' : 'text-muted-foreground')}>
                      {fmtNum(creditTotal)}
                    </span>
                  </div>
                </div>

                {/* T계정 본문 */}
                <div className="grid grid-cols-2 divide-x min-h-32">
                  {/* 차변 칸 */}
                  <div className="p-2 space-y-2 bg-blue-50/20">
                    {debitLineItems.map(({ line, idx }) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex gap-1 items-start">
                          <div className="flex-1 min-w-0">
                            <AccountCombobox
                              accounts={accounts}
                              value={line.account_code}
                              onChange={(code, name) => {
                                updateLine(idx, 'account_code', code);
                                updateLine(idx, 'account_name', name);
                              }}
                            />
                          </div>
                          <input
                            type="number" min="0" step="1"
                            className="w-28 h-8 rounded-md border border-input bg-background px-2 text-xs text-right tabular-nums shrink-0"
                            placeholder="금액"
                            value={line.debit || ''}
                            onChange={e => updateLine(idx, 'debit', Number(e.target.value) || 0)}
                          />
                          <button type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 2}
                            className="mt-0.5 shrink-0 text-muted-foreground hover:text-red-500 disabled:opacity-20">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input type="text"
                          className="w-full h-6 rounded border border-input bg-background px-2 text-xs text-muted-foreground"
                          placeholder="메모 (선택)"
                          value={line.memo}
                          onChange={e => updateLine(idx, 'memo', e.target.value)}
                        />
                      </div>
                    ))}
                    <button type="button" onClick={addDebitLine}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1">
                      <Plus className="w-3 h-3" /> 차변 추가
                    </button>
                  </div>

                  {/* 대변 칸 */}
                  <div className="p-2 space-y-2 bg-red-50/20">
                    {creditLineItems.map(({ line, idx }) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex gap-1 items-start">
                          <div className="flex-1 min-w-0">
                            <AccountCombobox
                              accounts={accounts}
                              value={line.account_code}
                              onChange={(code, name) => {
                                updateLine(idx, 'account_code', code);
                                updateLine(idx, 'account_name', name);
                              }}
                            />
                          </div>
                          <input
                            type="number" min="0" step="1"
                            className="w-28 h-8 rounded-md border border-input bg-background px-2 text-xs text-right tabular-nums shrink-0"
                            placeholder="금액"
                            value={line.credit || ''}
                            onChange={e => updateLine(idx, 'credit', Number(e.target.value) || 0)}
                          />
                          <button type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 2}
                            className="mt-0.5 shrink-0 text-muted-foreground hover:text-red-500 disabled:opacity-20">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input type="text"
                          className="w-full h-6 rounded border border-input bg-background px-2 text-xs text-muted-foreground"
                          placeholder="메모 (선택)"
                          value={line.memo}
                          onChange={e => updateLine(idx, 'memo', e.target.value)}
                        />
                      </div>
                    ))}
                    <button type="button" onClick={addCreditLine}
                      className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 mt-1">
                      <Plus className="w-3 h-3" /> 대변 추가
                    </button>
                  </div>
                </div>

                {/* T계정 균형 표시 */}
                <div className={cn('px-3 py-2 border-t flex items-center justify-between text-xs',
                  balanced ? 'bg-green-50' : diff !== 0 && debitTotal > 0 ? 'bg-red-50' : 'bg-muted/20')}>
                  {balanced ? (
                    <span className="flex items-center gap-1.5 text-green-700 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> 차대 균형 — 저장 가능
                    </span>
                  ) : debitTotal > 0 ? (
                    <span className="flex items-center gap-1.5 text-red-600 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      차액 {fmtNum(Math.abs(diff))}원 — {diff > 0 ? '대변에 추가 필요' : '차변에 추가 필요'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">금액을 입력하세요</span>
                  )}
                  <span className="text-muted-foreground">
                    차변 {fmtNum(debitTotal)} / 대변 {fmtNum(creditTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Error/Success */}
            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm">
                <CheckCircle className="w-4 h-4 shrink-0" />
                {success}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t flex gap-2 shrink-0">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button type="submit" className="flex-1" disabled={saving || !balanced}
            onClick={handleSubmit as unknown as React.MouseEventHandler}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (entry ? '수정 저장' : '전표 등록')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: 전표 ─────────────────────────────────────────────────────────────────

function JournalTab({
  accounts, entries, loading, onRefresh,
}: {
  accounts: Account[];
  entries: JournalEntry[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [modal, setModal] = useState<{ open: boolean; entry?: JournalEntry | null }>({ open: false });
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => entries.filter(e => {
    const ms = statusFilter === 'all' || e.status === statusFilter;
    const mt = typeFilter === 'all' || e.entry_type === typeFilter;
    const mq = !search || e.description.includes(search) || e.entry_no.includes(search) || (e.related_ref || '').includes(search);
    return ms && mt && mq;
  }), [entries, statusFilter, typeFilter, search]);

  const totalPosted = filtered.filter(e => e.status === 'posted').reduce((s, e) => s + e.debit_total, 0);

  const handleDelete = async (id: string) => {
    if (!confirm('이 전표를 삭제하시겠습니까?')) return;
    await fetch(`/api/accounting/journals/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="적요, 전표번호, 참조 검색..."
            className="pl-8 h-9 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">전체 상태</option>
          <option value="posted">확정</option>
          <option value="draft">임시</option>
          <option value="void">취소</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">전체 유형</option>
          {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <Button
          size="sm"
          onClick={() => setModal({ open: true, entry: null })}
          className="gap-1.5 h-9"
        >
          <Plus className="w-4 h-4" /> 전표 등록
        </Button>
      </div>

      {/* Summary card */}
      <div className="bg-muted/30 rounded-lg border p-3 flex items-center gap-6">
        <div>
          <span className="text-xs text-muted-foreground">조회 건수</span>
          <p className="font-semibold text-sm">{filtered.length}건</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">확정 전표 합계</span>
          <p className="font-semibold text-sm text-blue-700">{fmt(totalPosted)}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <HelpCircle className="w-3.5 h-3.5" />
          복식부기: 모든 전표의 차변합계 = 대변합계
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">전표번호</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">일자</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">유형</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">적요</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">차변</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">대변</th>
              <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground">상태</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr><td colSpan={8} className="text-center py-10">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                전표가 없습니다. &quot;+ 전표 등록&quot;을 눌러 첫 전표를 작성하세요.
              </td></tr>
            )}
            {filtered.map(e => (
              <tr
                key={e.id}
                className="hover:bg-muted/20 cursor-pointer"
                onClick={() => setModal({ open: true, entry: e })}
              >
                <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{e.entry_no}</td>
                <td className="px-3 py-2.5 text-xs">{e.entry_date}</td>
                <td className="px-3 py-2.5">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_COLORS[e.entry_type] || 'bg-gray-100 text-gray-600')}>
                    {typeLabel(e.entry_type)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-sm truncate max-w-56">{e.description}</p>
                  {e.related_ref && <p className="text-xs text-muted-foreground">{e.related_ref}</p>}
                </td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums text-blue-700">{fmtNum(e.debit_total)}</td>
                <td className="px-3 py-2.5 text-right text-xs tabular-nums text-red-600">{fmtNum(e.credit_total)}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', STATUS_STYLES[e.status] || 'bg-gray-100 text-gray-600')}>
                    {STATUS_LABELS[e.status] || e.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={ev => { ev.stopPropagation(); handleDelete(e.id); }}
                    className="text-muted-foreground hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <JournalEntryModal
          accounts={accounts}
          entry={modal.entry}
          onClose={() => setModal({ open: false })}
          onSave={onRefresh}
        />
      )}
    </div>
  );
}

// ─── Tab: 원장 (Ledger) ───────────────────────────────────────────────────────

function LedgerTab({ accounts }: { accounts: Account[] }) {
  const [selectedCode, setSelectedCode] = useState('');
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Array<{ entry_date: string; entry_no: string; description: string; debit: number; credit: number; [key: string]: unknown }>>([]);
  const [loading, setLoading] = useState(false);

  const selectedAccount = accounts.find(a => a.code === selectedCode);

  const load = useCallback(async () => {
    if (!selectedCode) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/accounting/reports?type=ledger&from=${from}&to=${to}&account=${selectedCode}`);
      const d = await r.json();
      setRows(Array.isArray(d.data) ? d.data : []);
    } finally { setLoading(false); }
  }, [selectedCode, from, to]);

  useEffect(() => { load(); }, [load]);

  // Running balance
  let runBal = 0;
  const rowsWithBal = rows.map(r => {
    const debit = Number(r.debit) || 0;
    const credit = Number(r.credit) || 0;
    if (selectedAccount?.normal_balance === 'debit') {
      runBal += debit - credit;
    } else {
      runBal += credit - debit;
    }
    return { ...r, running_balance: runBal };
  });

  const totalDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-60">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">계정과목</label>
          <AccountCombobox
            accounts={accounts}
            value={selectedCode}
            onChange={(code) => setSelectedCode(code)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">시작일</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">종료일</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 text-sm" />
        </div>
        <Button onClick={load} size="sm" className="h-9">조회</Button>
      </div>

      {selectedAccount && (
        <div className="bg-muted/30 rounded-lg border p-3 flex items-center gap-6">
          <div>
            <span className="text-xs text-muted-foreground">계정</span>
            <p className="font-semibold text-sm">{selectedAccount.code} {selectedAccount.name}</p>
            <p className="text-xs text-muted-foreground">{selectedAccount.description}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">차변 합계</span>
            <p className="font-semibold text-sm text-blue-700">{fmtNum(totalDebit)}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">대변 합계</span>
            <p className="font-semibold text-sm text-red-600">{fmtNum(totalCredit)}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">기말잔액</span>
            <p className="font-semibold text-sm">{fmtNum(runBal)}</p>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">날짜</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">전표번호</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">적요</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">차변</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">대변</th>
              <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">잔액</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!selectedCode && (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                좌측에서 계정과목을 선택하면 원장이 표시됩니다.
              </td></tr>
            )}
            {loading && (
              <tr><td colSpan={6} className="text-center py-10">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
              </td></tr>
            )}
            {!loading && selectedCode && rowsWithBal.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                해당 기간 거래 내역이 없습니다.
              </td></tr>
            )}
            {rowsWithBal.map((r, i) => (
              <tr key={i} className="hover:bg-muted/20">
                <td className="px-3 py-2 text-xs">{r.entry_date as string}</td>
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{r.entry_no as string}</td>
                <td className="px-3 py-2 text-xs truncate max-w-48">{r.description as string}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-blue-700">
                  {Number(r.debit) ? fmtNum(Number(r.debit)) : ''}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-red-600">
                  {Number(r.credit) ? fmtNum(Number(r.credit)) : ''}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">
                  {fmtNum(r.running_balance as number)}
                </td>
              </tr>
            ))}
            {rowsWithBal.length > 0 && (
              <tr className="bg-muted/20 font-medium">
                <td colSpan={3} className="px-3 py-2 text-xs">합계</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-blue-700">{fmtNum(totalDebit)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-red-600">{fmtNum(totalCredit)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{fmtNum(runBal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: 대차대조표 (Balance Sheet) ──────────────────────────────────────────

interface BSData {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netIncome: number;
  period: { from: string; to: string };
}

function BalanceSheetTab() {
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<BSData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/accounting/reports?type=balance-sheet&from=${from}&to=${to}`);
      const d = await r.json();
      setData(d.data);
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const balanced = data ? Math.abs(data.totalAssets - data.totalLiabilities - data.totalEquity) < 1 : false;

  const groupedAssets = useMemo(() => {
    if (!data) return {} as Record<string, AccountBalance[]>;
    return data.assets.reduce((acc, a) => {
      const g = a.group_name || '기타';
      if (!acc[g]) acc[g] = [];
      acc[g].push(a);
      return acc;
    }, {} as Record<string, AccountBalance[]>);
  }, [data]);

  const groupedLiab = useMemo(() => {
    if (!data) return {} as Record<string, AccountBalance[]>;
    return data.liabilities.reduce((acc, a) => {
      const g = a.group_name || '기타';
      if (!acc[g]) acc[g] = [];
      acc[g].push(a);
      return acc;
    }, {} as Record<string, AccountBalance[]>);
  }, [data]);

  const groupedEquity = useMemo(() => {
    if (!data) return {} as Record<string, AccountBalance[]>;
    return data.equity.reduce((acc, a) => {
      const g = a.group_name || '자본';
      if (!acc[g]) acc[g] = [];
      acc[g].push(a);
      return acc;
    }, {} as Record<string, AccountBalance[]>);
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">시작일</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">기준일 (종료일)</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 text-sm" />
        </div>
        <Button onClick={load} size="sm" className="h-9">조회</Button>
        {data && (
          <div className={cn('flex items-center gap-1.5 text-sm ml-auto', balanced ? 'text-green-600' : 'text-red-600')}>
            {balanced
              ? <><CheckCircle className="w-4 h-4" /> 자산합계 = 부채+자본</>
              : <><AlertCircle className="w-4 h-4" /> 대차 불일치 — 전표를 확인하세요</>
            }
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-2 gap-4">
          {/* 자산 */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-blue-50 border-b px-4 py-2.5 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-blue-800">자산 (Assets)</h3>
              <span className="text-sm font-bold text-blue-800">{fmt(data.totalAssets)}</span>
            </div>
            <div className="divide-y">
              {Object.entries(groupedAssets).map(([group, items]) => (
                <div key={group}>
                  <div className="px-4 py-1.5 bg-muted/20">
                    <span className="text-xs font-medium text-muted-foreground">{group}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {fmt(items.reduce((s, a) => s + a.balance, 0))}
                    </span>
                  </div>
                  {items.map(a => (
                    <div key={a.account_code} className="px-4 py-1.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground w-10 font-mono">{a.account_code}</span>
                      <span className="text-xs flex-1 ml-2">{a.account_name}</span>
                      <span className={cn('text-xs tabular-nums font-medium', a.balance < 0 ? 'text-red-600' : '')}>
                        {fmtNum(a.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {data.assets.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">자산 데이터가 없습니다.</p>
              )}
            </div>
            <div className="bg-blue-50 border-t px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-bold text-blue-800">자산 합계</span>
              <span className="text-sm font-bold text-blue-800">{fmt(data.totalAssets)}</span>
            </div>
          </div>

          {/* 부채+자본 */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-red-50 border-b px-4 py-2.5 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-red-800">부채+자본 (Liabilities+Equity)</h3>
              <span className="text-sm font-bold text-red-800">{fmt(data.totalLiabilities + data.totalEquity)}</span>
            </div>
            <div className="divide-y">
              {/* 부채 */}
              {Object.entries(groupedLiab).map(([group, items]) => (
                <div key={group}>
                  <div className="px-4 py-1.5 bg-muted/20">
                    <span className="text-xs font-medium text-muted-foreground">{group}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {fmt(items.reduce((s, a) => s + a.balance, 0))}
                    </span>
                  </div>
                  {items.map(a => (
                    <div key={a.account_code} className="px-4 py-1.5 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground w-10 font-mono">{a.account_code}</span>
                      <span className="text-xs flex-1 ml-2">{a.account_name}</span>
                      <span className="text-xs tabular-nums font-medium">{fmtNum(a.balance)}</span>
                    </div>
                  ))}
                </div>
              ))}
              {data.liabilities.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">부채 데이터가 없습니다.</p>
              )}
              {/* 자본 */}
              <div className="bg-purple-50/30">
                <div className="px-4 py-1.5 bg-purple-50 border-y border-purple-100">
                  <span className="text-xs font-medium text-purple-700">자본 (Equity)</span>
                </div>
                {Object.values(groupedEquity).flat().map(a => (
                  <div key={a.account_code} className="px-4 py-1.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground w-10 font-mono">{a.account_code}</span>
                    <span className="text-xs flex-1 ml-2">{a.account_name}</span>
                    <span className="text-xs tabular-nums font-medium">{fmtNum(a.balance)}</span>
                  </div>
                ))}
                {/* Net income */}
                <div className="px-4 py-1.5 flex items-center justify-between bg-green-50/50">
                  <span className="text-xs text-muted-foreground w-10 font-mono">—</span>
                  <span className="text-xs flex-1 ml-2 text-green-700">당기순이익</span>
                  <span className={cn('text-xs tabular-nums font-medium', data.netIncome < 0 ? 'text-red-600' : 'text-green-700')}>
                    {fmtNum(data.netIncome)}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-red-50 border-t px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-bold text-red-800">부채+자본 합계</span>
              <span className="text-sm font-bold text-red-800">{fmt(data.totalLiabilities + data.totalEquity)}</span>
            </div>
          </div>
        </div>
      )}

      {!loading && !data && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          기간을 선택하고 조회 버튼을 누르세요.
        </div>
      )}
    </div>
  );
}

// ─── Tab: 손익계산서 (Income Statement) ───────────────────────────────────────

interface IncomeData {
  revenue: AccountBalance[];
  expense: AccountBalance[];
  cogs: AccountBalance[];
  opex: AccountBalance[];
  nonOp: AccountBalance[];
  nonOpRev: AccountBalance[];
  totalRevenue: number;
  totalExpense: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  period: { from: string; to: string };
}

function IncomeRow({ label, amount, total, indent = 0, bold = false, highlight }: {
  label: string; amount: number; total?: number;
  indent?: number; bold?: boolean; highlight?: 'profit' | 'loss';
}) {
  const pct = total && total !== 0 ? ((amount / total) * 100).toFixed(1) : null;
  return (
    <tr className={cn(
      'border-b last:border-0',
      bold ? 'bg-muted/20 font-semibold' : 'hover:bg-muted/10',
      highlight === 'profit' && 'bg-green-50',
      highlight === 'loss' && 'bg-red-50',
    )}>
      <td className={cn('px-4 py-2 text-sm', bold ? 'font-semibold' : '')} style={{ paddingLeft: `${16 + indent * 16}px` }}>
        {label}
      </td>
      <td className={cn('px-4 py-2 text-right text-sm tabular-nums', bold ? 'font-semibold' : '',
        highlight === 'profit' ? 'text-green-700' : highlight === 'loss' ? 'text-red-600' : '')}>
        {fmt(amount)}
      </td>
      <td className="px-4 py-2 text-right text-xs text-muted-foreground tabular-nums">
        {pct !== null ? `${pct}%` : ''}
      </td>
    </tr>
  );
}

function IncomeStatementTab() {
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<IncomeData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/accounting/reports?type=income&from=${from}&to=${to}`);
      const d = await r.json();
      setData(d.data);
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const mainRevenue = data ? data.revenue.filter(a => a.group_name === '매출') : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">시작일</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">종료일</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 text-sm" />
        </div>
        <Button onClick={load} size="sm" className="h-9">조회</Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && data && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/40 border-b px-4 py-3">
            <h3 className="font-semibold text-sm">손익계산서</h3>
            <p className="text-xs text-muted-foreground">{data.period.from} ~ {data.period.to}</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-muted/20 border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">항목</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">금액</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">비율</th>
              </tr>
            </thead>
            <tbody>
              {/* 매출 */}
              <IncomeRow label="I. 매출" amount={data.totalRevenue} bold />
              {mainRevenue.map(a => (
                <IncomeRow key={a.account_code} label={`${a.account_code} ${a.account_name}`} amount={a.balance} total={data.totalRevenue} indent={1} />
              ))}
              {/* 매출원가 */}
              <IncomeRow label="II. 매출원가" amount={data.cogs.reduce((s, a) => s + a.balance, 0)} bold total={data.totalRevenue} />
              {data.cogs.map(a => (
                <IncomeRow key={a.account_code} label={`${a.account_code} ${a.account_name}`} amount={a.balance} total={data.totalRevenue} indent={1} />
              ))}
              {/* 매출총이익 */}
              <IncomeRow
                label="III. 매출총이익"
                amount={data.grossProfit}
                total={data.totalRevenue}
                bold
                highlight={data.grossProfit >= 0 ? 'profit' : 'loss'}
              />
              {/* 판관비 */}
              <IncomeRow label="IV. 판매관리비 및 수입원가" amount={data.opex.reduce((s, a) => s + a.balance, 0)} bold total={data.totalRevenue} />
              {data.opex.map(a => (
                <IncomeRow key={a.account_code} label={`${a.account_code} ${a.account_name}`} amount={a.balance} total={data.totalRevenue} indent={1} />
              ))}
              {/* 영업이익 */}
              <IncomeRow
                label="V. 영업이익"
                amount={data.operatingIncome}
                total={data.totalRevenue}
                bold
                highlight={data.operatingIncome >= 0 ? 'profit' : 'loss'}
              />
              {/* 영업외수익 */}
              {data.nonOpRev.length > 0 && (
                <>
                  <IncomeRow label="VI. 영업외수익" amount={data.nonOpRev.reduce((s, a) => s + a.balance, 0)} bold total={data.totalRevenue} />
                  {data.nonOpRev.map(a => (
                    <IncomeRow key={a.account_code} label={`${a.account_code} ${a.account_name}`} amount={a.balance} total={data.totalRevenue} indent={1} />
                  ))}
                </>
              )}
              {/* 영업외비용 */}
              {data.nonOp.length > 0 && (
                <>
                  <IncomeRow label="VII. 영업외비용" amount={data.nonOp.reduce((s, a) => s + a.balance, 0)} bold total={data.totalRevenue} />
                  {data.nonOp.map(a => (
                    <IncomeRow key={a.account_code} label={`${a.account_code} ${a.account_name}`} amount={a.balance} total={data.totalRevenue} indent={1} />
                  ))}
                </>
              )}
              {/* 당기순이익 */}
              <IncomeRow
                label="VIII. 당기순이익"
                amount={data.netIncome}
                total={data.totalRevenue}
                bold
                highlight={data.netIncome >= 0 ? 'profit' : 'loss'}
              />
            </tbody>
          </table>

          {/* Summary cards */}
          <div className="border-t grid grid-cols-3 divide-x">
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">총 매출</p>
              <p className="text-lg font-bold text-foreground">{fmt(data.totalRevenue)}</p>
            </div>
            <div className={cn('p-4 text-center', data.operatingIncome >= 0 ? 'bg-green-50' : 'bg-red-50')}>
              <p className="text-xs text-muted-foreground mb-1">영업이익</p>
              <p className={cn('text-lg font-bold', data.operatingIncome >= 0 ? 'text-green-700' : 'text-red-600')}>
                {fmt(data.operatingIncome)}
              </p>
            </div>
            <div className={cn('p-4 text-center', data.netIncome >= 0 ? 'bg-green-50' : 'bg-red-50')}>
              <p className="text-xs text-muted-foreground mb-1">당기순이익</p>
              <p className={cn('text-lg font-bold', data.netIncome >= 0 ? 'text-green-700' : 'text-red-600')}>
                {fmt(data.netIncome)}
              </p>
              {data.totalRevenue > 0 && (
                <p className="text-xs text-muted-foreground">
                  순이익률 {((data.netIncome / data.totalRevenue) * 100).toFixed(1)}%
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && !data && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          기간을 선택하고 조회 버튼을 누르세요.
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabId = 'journal' | 'ledger' | 'balance-sheet' | 'income';

export default function AccountingPage() {
  const [tab, setTab] = useState<TabId>('journal');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(async () => {
    const r = await fetch('/api/accounting/accounts');
    const d = await r.json();
    setAccounts(Array.isArray(d.data) ? d.data : []);
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/accounting/journals');
    const d = await r.json();
    setEntries(Array.isArray(d.data) ? d.data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccounts();
    loadEntries();
  }, [loadAccounts, loadEntries]);

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'journal', label: '전표', icon: <FileText className="w-4 h-4" /> },
    { id: 'ledger', label: '원장', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'balance-sheet', label: '대차대조표', icon: <Scale className="w-4 h-4" /> },
    { id: 'income', label: '손익계산서', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="복식부기 회계" />
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        {/* Tab nav */}
        <div className="flex gap-1 border-b pb-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
            <HelpCircle className="w-3.5 h-3.5" />
            복식부기: 거래마다 차변(Dr.)과 대변(Cr.)을 동시에 기록
          </div>
        </div>

        {/* Tab content */}
        {tab === 'journal' && (
          <JournalTab
            accounts={accounts}
            entries={entries}
            loading={loading}
            onRefresh={loadEntries}
          />
        )}
        {tab === 'ledger' && <LedgerTab accounts={accounts} />}
        {tab === 'balance-sheet' && <BalanceSheetTab />}
        {tab === 'income' && <IncomeStatementTab />}
      </div>
    </div>
  );
}
