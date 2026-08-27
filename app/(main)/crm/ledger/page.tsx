'use client';

import { AppHeader } from '@/components/layout/header';
import { Loader2, BookOpen, FileSpreadsheet, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface Company { id: string; name: string; type: string }
interface LedgerEntry {
  saleId: string; saleBusinessId: string; date: string;
  productName: string; specification: string; qty: number; unitPrice: number; amount: number; currency: string;
}

export default function CompanyLedgerPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const now = new Date();
  const [start, setStart] = useState(`${now.getFullYear()}-01-01`);
  const [end, setEnd] = useState(now.toISOString().slice(0, 10));
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/companies').then(r => r.json()).then(j => {
      const list: Company[] = Array.isArray(j.data) ? j.data : [];
      setCompanies(list);
      if (!companyId && list.length > 0) { setCompanyId(list[0].id); setCompanySearch(list[0].name); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 거래처명을 직접 입력하면(자동완성 목록에서 고르든 타이핑하든) 이름이 정확히 일치하는
  // 회사를 찾아 조회 대상으로 연결한다 — 대소문자 구분 없이.
  const selectCompanyByName = (name: string) => {
    setCompanySearch(name);
    const q = name.trim().toLowerCase();
    const c = companies.find(c => c.name.toLowerCase() === q);
    if (c) setCompanyId(c.id);
  };

  const load = () => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/companies/${companyId}/ledger?start=${start}&end=${end}`).then(r => r.json()).then(j => {
      if (j.data) { setEntries(j.data.entries || []); setCompanyName(j.data.company?.name || ''); }
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // 월별로 묶고, 각 항목에 누적소계(전체 기간 누적)를 계산
  const rows = useMemo(() => {
    type Row =
      | { kind: 'entry'; entry: LedgerEntry; cumulative: number }
      | { kind: 'subtotal'; month: string; qtySum: number; amountSum: number; cumulative: number };
    const out: Row[] = [];
    let cumulative = 0;
    let curMonth = '';
    let monthQty = 0, monthAmount = 0;

    const flushMonth = () => {
      if (curMonth) out.push({ kind: 'subtotal', month: curMonth, qtySum: monthQty, amountSum: monthAmount, cumulative });
      monthQty = 0; monthAmount = 0;
    };

    for (const e of entries) {
      const m = e.date.slice(0, 7);
      if (m !== curMonth) {
        flushMonth();
        curMonth = m;
      }
      cumulative += e.amount;
      monthQty += e.qty;
      monthAmount += e.amount;
      out.push({ kind: 'entry', entry: e, cumulative });
    }
    flushMonth();
    return out;
  }, [entries]);

  const grandTotal = entries.reduce((s, e) => s + e.amount, 0);
  const grandQty = entries.reduce((s, e) => s + e.qty, 0);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="거래처원장" icon={<BookOpen className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <div className="bg-card border rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">거래처</label>
            <input list="ledger-company-list" value={companySearch} onChange={e => selectCompanyByName(e.target.value)}
              placeholder="거래처명 검색..." autoComplete="off"
              className="h-9 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm" />
            <datalist id="ledger-company-list">
              {companies.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
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
          {companyId && (
            <div className="flex gap-2">
              <a href={`/api/companies/${companyId}/ledger/export?format=excel&start=${start}&end=${end}`}
                className="h-9 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4" /> 엑셀
              </a>
              <a href={`/api/companies/${companyId}/ledger/export?format=pdf&start=${start}&end=${end}`} target="_blank" rel="noreferrer"
                className="h-9 px-3 rounded-md border border-input text-sm font-medium hover:bg-muted/50 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> PDF
              </a>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">거래처</p>
            <p className="text-lg font-bold mt-1">{companyName || '-'}</p>
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
                  {rows.map((r, idx) => r.kind === 'entry' ? (
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
                  ) : (
                    <tr key={`s-${idx}`} className="bg-blue-50/60 dark:bg-blue-950/20 font-semibold">
                      <td colSpan={4} className="px-3 py-2">{r.month} 월별소계</td>
                      <td className="px-3 py-2 text-right">{r.qtySum.toLocaleString()}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right">{r.amountSum.toLocaleString()}</td>
                      <td className={cn('px-3 py-2 text-right text-primary')}>{r.cumulative.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
