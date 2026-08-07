'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_QUOTES } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const statusStyle: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', expired: 'bg-orange-100 text-orange-700' };
const statusLabel: Record<string, string> = { draft: '초안', sent: '발송', accepted: '수락', rejected: '거절', expired: '만료' };
const typeLabel: Record<string, string> = { customer: '판매견적', supplier: '구매견적' };
const typeStyle: Record<string, string> = { customer: 'bg-emerald-50 text-emerald-700', supplier: 'bg-violet-50 text-violet-700' };

export default function QuotesPage() {
  const [search, setSearch] = useState('');
  const filtered = DEMO_QUOTES.filter(q =>
    q.businessId.includes(search) || q.companyName.includes(search) ||
    q.items.some(i => i.productName.includes(search))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="견적" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="견적번호, 거래처명 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0"><Plus className="w-4 h-4" /><span className="hidden sm:inline">새 견적</span></Button>
        </div>

        {/* Desktop */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{['견적번호','유형','거래처','제품','통화','유효기한','상태'].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(q=>(
                <tr key={q.id} className="hover:bg-muted/30 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-xs">{q.businessId}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',typeStyle[q.type])}>{typeLabel[q.type]}</span></td>
                  <td className="px-4 py-3 font-medium max-w-[160px] truncate">{q.companyName}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{q.items.map(i=>i.productName).join(', ')}</td>
                  <td className="px-4 py-3 text-xs">{q.currency}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{q.validity??'-'}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',statusStyle[q.status])}>{statusLabel[q.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30"/>견적 내역이 없습니다.</div>}
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-2">
          {filtered.map(q=>(
            <div key={q.id} className="bg-card border border-border rounded-xl p-4 active:bg-muted/50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{q.businessId}</p>
                  <p className="font-semibold text-sm mt-0.5">{q.companyName}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full',typeStyle[q.type])}>{typeLabel[q.type]}</span>
                  <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full',statusStyle[q.status])}>{statusLabel[q.status]}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate">{q.items.map(i=>i.productName).join(', ')}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{q.currency}</span>{q.validity&&<span>유효: {q.validity}</span>}
              </div>
            </div>
          ))}
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground">견적 내역이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
