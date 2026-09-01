'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, BookOpen, FileSpreadsheet, FileText, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface Company { id: string; name: string; type: string }
interface LedgerEntry {
  saleId: string; saleBusinessId: string; date: string;
  productName: string; specification: string; qty: number; unitPrice: number; amount: number; currency: string;
  companyId: string; companyName: string;
}

export default function CompanyLedgerPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<Company[]>([]); // 여러 거래처 동시 선택
  const [companySearch, setCompanySearch] = useState('');
  const now = new Date();
  const [start, setStart] = useState(`${now.getFullYear()}-01-01`);
  const [end, setEnd] = useState(now.toISOString().slice(0, 10));
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/companies').then(r => r.json()).then(j => {
      const list: Company[] = Array.isArray(j.data) ? j.data : [];
      setCompanies(list);
      setSelected(prev => (prev.length === 0 && list.length > 0) ? [list[0]] : prev);
    });
  }, []);

  // 거래처명을 입력해 자동완성 목록에서 정확히 일치하면 선택 목록에 추가한다(중복 추가 방지).
  const addCompanyByName = (name: string) => {
    setCompanySearch(name);
    const q = name.trim().toLowerCase();
    if (!q) return;
    const c = companies.find(c => c.name.toLowerCase() === q);
    if (c && !selected.some(s => s.id === c.id)) {
      setSelected(prev => [...prev, c]);
      setCompanySearch('');
    }
  };

  const removeCompany = (id: string) => setSelected(prev => prev.filter(c => c.id !== id));

  const load = () => {
    if (selected.length === 0) { setEntries([]); return; }
    setLoading(true);
    Promise.all(selected.map(c =>
      fetch(`/api/companies/${c.id}/ledger?start=${start}&end=${end}`)
        .then(r => r.json())
        .then(j => {
          const list = (j.data?.entries || []) as Omit<LedgerEntry, 'companyId' | 'companyName'>[];
          const name = j.data?.company?.name || c.name;
          return list.map(e => ({ ...e, companyId: c.id, companyName: name }));
        })
        .catch(() => [] as LedgerEntry[])
    )).then(results => setEntries(results.flat())).finally(() => setLoading(false));
  };

  const selectedKey = selected.map(c => c.id).join(',');
  useEffect(() => {
    if (selected.length > 0) load();
    else setEntries([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // 선택 순서를 유지하며 거래처별로 묶는다
  const grouped = useMemo(() => {
    const byCompany = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      if (!byCompany.has(e.companyId)) byCompany.set(e.companyId, []);
      byCompany.get(e.companyId)!.push(e);
    }
    return selected
      .filter(c => byCompany.has(c.id))
      .map(c => ({ company: c, entries: byCompany.get(c.id)! }));
  }, [entries, selected]);

  // 거래처별로: 월별소계 + 누적소계(거래처 단위로 리셋) + 거래처총계, 여러 거래처면 마지막에 전체총계
  const rows = useMemo(() => {
    type Row =
      | { kind: 'company-header'; companyName: string; companyId: string }
      | { kind: 'entry'; entry: LedgerEntry; cumulative: number }
      | { kind: 'subtotal'; month: string; qtySum: number; amountSum: number; cumulative: number }
      | { kind: 'company-total'; companyName: string; qtySum: number; amountSum: number }
      | { kind: 'grand-total'; qtySum: number; amountSum: number };
    const out: Row[] = [];
    const multi = grouped.length > 1;

    for (const { company, entries: companyEntries } of grouped) {
      if (multi) out.push({ kind: 'company-header', companyName: company.name, companyId: company.id });
      let cumulative = 0;
      let curMonth = '';
      let monthQty = 0, monthAmount = 0;
      let companyQty = 0, companyAmount = 0;

      const flushMonth = () => {
        if (curMonth) out.push({ kind: 'subtotal', month: curMonth, qtySum: monthQty, amountSum: monthAmount, cumulative });
        monthQty = 0; monthAmount = 0;
      };

      for (const e of companyEntries) {
        const m = e.date.slice(0, 7);
        if (m !== curMonth) { flushMonth(); curMonth = m; }
        cumulative += e.amount;
        monthQty += e.qty; monthAmount += e.amount;
        companyQty += e.qty; companyAmount += e.amount;
        out.push({ kind: 'entry', entry: e, cumulative });
      }
      flushMonth();
      if (multi) out.push({ kind: 'company-total', companyName: company.name, qtySum: companyQty, amountSum: companyAmount });
    }

    if (multi && entries.length > 0) {
      out.push({ kind: 'grand-total', qtySum: entries.reduce((s, e) => s + e.qty, 0), amountSum: entries.reduce((s, e) => s + e.amount, 0) });
    }
    return out;
  }, [grouped, entries]);

  const grandTotal = entries.reduce((s, e) => s + e.amount, 0);
  const grandQty = entries.reduce((s, e) => s + e.qty, 0);
  const companyLabel = selected.length === 0 ? '-' : selected.length === 1 ? selected[0].name : `${selected.length}개 거래처`;

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="거래처원장" icon={<BookOpen className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="bg-card border rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">거래처 (여러 개 선택 가능)</label>
            <input list="ledger-company-list" value={companySearch} onChange={e => addCompanyByName(e.target.value)}
              placeholder="거래처명 검색 후 선택..." autoComplete="off"
              className="h-9 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm" />
            <datalist id="ledger-company-list">
              {companies.filter(c => !selected.some(s => s.id === c.id)).map(c => <option key={c.id} value={c.name} />)}
            </datalist>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 max-w-md">
                {selected.map(c => (
                  <span key={c.id} className="inline-flex items-center gap-1 text-xs bg-muted rounded-full pl-2.5 pr-1 py-1">
                    {c.name}
                    <button type="button" onClick={() => removeCompany(c.id)} className="hover:bg-background rounded-full p-0.5" title="제거">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">시작일</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">종료일</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <button type="button" onClick={load} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            조회
          </button>
          <div className="flex-1" />
          {selected.length === 1 && (
            <div className="flex gap-2">
              <a href={`/api/companies/${selected[0].id}/ledger/export?format=excel&start=${start}&end=${end}`}
                className="h-9 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4" /> 엑셀
              </a>
              <a href={`/api/companies/${selected[0].id}/ledger/export?format=pdf&start=${start}&end=${end}`} target="_blank" rel="noreferrer"
                className="h-9 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> PDF
              </a>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">거래처</p>
            <p className="text-lg font-bold mt-1 truncate" title={selected.map(c => c.name).join(', ')}>{companyLabel}</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">기간 총 수량</p>
            <p className="text-lg font-bold mt-1">{grandQty.toLocaleString()}</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">기간 총 판매금액</p>
            <p className="text-lg font-bold mt-1 text-primary">{grandTotal.toLocaleString()}원</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">해당 기간에 거래 내역이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[820px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">날짜</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">거래번호</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">품목</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">규격</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">수량</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">단가</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">금액</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">누적소계</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, idx) => {
                    if (r.kind === 'entry') return (
                      <tr key={`e-${idx}`} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5 whitespace-nowrap">{r.entry.date}</td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{r.entry.saleBusinessId}</td>
                        <td className="px-3 py-1.5"><span className="truncate block max-w-[220px]">{r.entry.productName}</span></td>
                        <td className="px-3 py-1.5 text-muted-foreground"><span className="truncate block max-w-[160px]">{r.entry.specification}</span></td>
                        <td className="px-3 py-1.5 text-right">{r.entry.qty.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right">{r.entry.unitPrice.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{r.entry.amount.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{r.cumulative.toLocaleString()}</td>
                      </tr>
                    );
                    if (r.kind === 'subtotal') return (
                      <tr key={`s-${idx}`} className="bg-blue-50/60 dark:bg-blue-950/20 font-semibold">
                        <td colSpan={4} className="px-3 py-2">{r.month} 월별소계</td>
                        <td className="px-3 py-2 text-right">{r.qtySum.toLocaleString()}</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right">{r.amountSum.toLocaleString()}</td>
                        <td className={cn('px-3 py-2 text-right text-primary')}>{r.cumulative.toLocaleString()}</td>
                      </tr>
                    );
                    if (r.kind === 'company-header') return (
                      <tr key={`ch-${idx}`} className="bg-muted/70">
                        <td colSpan={8} className="px-3 py-2 font-bold flex items-center justify-between">
                          <span>{r.companyName}</span>
                          <span className="flex gap-2 font-normal">
                            <a href={`/api/companies/${r.companyId}/ledger/export?format=excel&start=${start}&end=${end}`}
                              className="text-muted-foreground hover:text-foreground flex items-center gap-1" title="엑셀 다운로드">
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            </a>
                            <a href={`/api/companies/${r.companyId}/ledger/export?format=pdf&start=${start}&end=${end}`} target="_blank" rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground flex items-center gap-1" title="PDF 다운로드">
                              <FileText className="w-3.5 h-3.5" />
                            </a>
                          </span>
                        </td>
                      </tr>
                    );
                    if (r.kind === 'company-total') return (
                      <tr key={`ct-${idx}`} className="bg-green-50/60 dark:bg-green-950/20 font-semibold">
                        <td colSpan={4} className="px-3 py-2">{r.companyName} 소계</td>
                        <td className="px-3 py-2 text-right">{r.qtySum.toLocaleString()}</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right">{r.amountSum.toLocaleString()}</td>
                        <td className="px-3 py-2" />
                      </tr>
                    );
                    return (
                      <tr key={`gt-${idx}`} className="bg-primary/10 font-bold text-sm">
                        <td colSpan={4} className="px-3 py-2.5">전체 총계</td>
                        <td className="px-3 py-2.5 text-right">{r.qtySum.toLocaleString()}</td>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-right text-primary">{r.amountSum.toLocaleString()}</td>
                        <td className="px-3 py-2.5" />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
