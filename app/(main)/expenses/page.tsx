'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_EXPENSES } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const statusStyle: Record<string,string> = { pending:'bg-yellow-100 text-yellow-700', approved:'bg-blue-100 text-blue-700', paid:'bg-green-100 text-green-700' };
const statusLabel: Record<string,string> = { pending:'대기', approved:'승인', paid:'지급완료' };
const catColor: Record<string,string> = { '해상운임':'bg-blue-50 text-blue-700', '통관비':'bg-orange-50 text-orange-700', '검품비':'bg-purple-50 text-purple-700', '샘플비':'bg-green-50 text-green-700' };

export default function ExpensesPage() {
  const [search, setSearch] = useState('');
  const filtered = DEMO_EXPENSES.filter(e =>
    e.businessId.includes(search)||e.description.includes(search)||e.category.includes(search)
  );
  const totalKrw = filtered.reduce((s,e)=>s+(e.amountKrw??e.amount),0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="비용" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground">전체 비용</p>
            <p className="text-lg font-bold mt-0.5">₩{totalKrw.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground">대기</p>
            <p className="text-lg font-bold text-yellow-600 mt-0.5">{filtered.filter(e=>e.status==='pending').length}건</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground">지급완료</p>
            <p className="text-lg font-bold text-green-600 mt-0.5">{filtered.filter(e=>e.status==='paid').length}건</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
            <Input placeholder="비용번호, 설명 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0"><Plus className="w-4 h-4"/><span className="hidden sm:inline">비용 등록</span></Button>
        </div>

        {/* Desktop */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{['번호','카테고리','설명','금액','원화금액','관련','상태'].map(h=><th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground',['금액','원화금액'].includes(h)?'text-right':'text-left')}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(e=>(
                <tr key={e.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{e.businessId}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs px-2 py-0.5 rounded-full',catColor[e.category]??'bg-gray-100 text-gray-600')}>{e.category}</span></td>
                  <td className="px-4 py-3 text-sm max-w-[200px] truncate">{e.description}</td>
                  <td className="px-4 py-3 text-right text-xs font-mono">{e.currency} {e.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-sm">₩{(e.amountKrw??e.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">{e.relatedName??'-'}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',statusStyle[e.status])}>{statusLabel[e.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30"/>비용 내역이 없습니다.</div>}
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-2">
          {filtered.map(e=>(
            <div key={e.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[11px] px-2 py-0.5 rounded-full shrink-0',catColor[e.category]??'bg-gray-100 text-gray-600')}>{e.category}</span>
                    <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full',statusStyle[e.status])}>{statusLabel[e.status]}</span>
                  </div>
                  <p className="text-sm font-medium mt-1 truncate">{e.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-base">₩{(e.amountKrw??e.amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{e.currency} {e.amount.toLocaleString()}</p>
                </div>
              </div>
              {e.relatedName&&<p className="text-xs text-muted-foreground mt-1">{e.relatedName}</p>}
            </div>
          ))}
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground">비용 내역이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
