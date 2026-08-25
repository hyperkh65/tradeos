'use client';

import { AppHeader } from '@/components/layout/header';
import { Wallet, Loader2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface CashflowEntry {
  date: string; type: 'in' | 'out'; source: 'sale' | 'commission' | 'cost';
  refBusinessId: string; refName: string; amount: number; balance: number;
}

const sourceLabel: Record<string, string> = { sale: '매출 입금', commission: '커미션 입금', cost: '비용 지급' };

export default function CashflowPage() {
  const now = new Date();
  const [start, setStart] = useState(`${now.getFullYear()}-01-01`);
  const [end, setEnd] = useState(now.toISOString().slice(0, 10));
  const [entries, setEntries] = useState<CashflowEntry[]>([]);
  const [totals, setTotals] = useState({ totalIn: 0, totalOut: 0, net: 0 });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/cashflow?start=${start}&end=${end}`).then(r => r.json()).then(j => {
      setEntries(Array.isArray(j.data) ? j.data : []);
      setTotals({ totalIn: j.totalIn || 0, totalOut: j.totalOut || 0, net: j.net || 0 });
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="입출금 현황" icon={<Wallet className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          매출/커미션의 입금 기록과 비용원장의 지급 완료 건을 모아서 보여주는 조회 화면입니다. 여기서 직접 입력하지 않고, 각 원본 화면(매출관리/커미션/비용원장)에서 입력한 내용이 자동으로 모입니다.
        </p>

        <div className="bg-card border rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">시작일</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">종료일</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <button type="button" onClick={load} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">조회</button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><ArrowDownCircle className="w-3.5 h-3.5 text-green-600" /> 총 입금</p>
            <p className="text-xl font-bold mt-1 text-green-600">{totals.totalIn.toLocaleString()}원</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><ArrowUpCircle className="w-3.5 h-3.5 text-red-600" /> 총 지급</p>
            <p className="text-xl font-bold mt-1 text-red-600">{totals.totalOut.toLocaleString()}원</p>
          </div>
          <div className="bg-card border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">순증감</p>
            <p className={cn('text-xl font-bold mt-1', totals.net >= 0 ? 'text-primary' : 'text-red-600')}>{totals.net.toLocaleString()}원</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">해당 기간에 입출금 내역이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[760px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">날짜</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">구분</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">출처</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">거래처</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">번호</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">금액</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((e, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">{e.date}</td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', e.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                          {e.type === 'in' ? '입금' : '지급'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{sourceLabel[e.source]}</td>
                      <td className="px-3 py-2"><span className="truncate block max-w-[160px]">{e.refName}</span></td>
                      <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{e.refBusinessId}</td>
                      <td className={cn('px-3 py-2 text-right font-medium whitespace-nowrap', e.type === 'in' ? 'text-green-700' : 'text-red-700')}>
                        {e.type === 'in' ? '+' : '-'}{e.amount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{e.balance.toLocaleString()}</td>
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
