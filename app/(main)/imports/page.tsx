'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_IMPORTS } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TruckIcon, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const statusStyle: Record<string,string> = { in_progress:'bg-blue-100 text-blue-700', declared:'bg-yellow-100 text-yellow-700', released:'bg-purple-100 text-purple-700', completed:'bg-green-100 text-green-700' };
const statusLabel: Record<string,string> = { in_progress:'진행중', declared:'신고', released:'반출', completed:'완료' };
const coStyle: Record<string,string> = { '수령':'bg-green-50 text-green-700', '미수령':'bg-orange-50 text-orange-700', '불필요':'bg-gray-50 text-gray-600' };

export default function ImportsPage() {
  const [search, setSearch] = useState('');
  const filtered = DEMO_IMPORTS.filter(i =>
    i.businessId.includes(search)||i.shipmentBusinessId.includes(search)||(i.declarationNo??'').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="수입통관" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="통관번호, 선적번호 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0"><Plus className="w-4 h-4"/><span className="hidden sm:inline">통관 등록</span></Button>
        </div>

        {/* Desktop */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{['통관번호','선적','관세사','관세','부가세','C/O','반출일','상태'].map(h=><th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground',['관세','부가세'].includes(h)?'text-right':'text-left')}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(imp=>(
                <tr key={imp.id} className="hover:bg-muted/30 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-xs">{imp.businessId}</td>
                  <td className="px-4 py-3 text-xs font-medium">{imp.shipmentBusinessId}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{imp.brokerName??'-'}</td>
                  <td className="px-4 py-3 text-right text-xs">{imp.duty?imp.duty.toLocaleString()+'원':'-'}</td>
                  <td className="px-4 py-3 text-right text-xs">{imp.vat?imp.vat.toLocaleString()+'원':'-'}</td>
                  <td className="px-4 py-3">{imp.coStatus&&<span className={cn('text-xs px-2 py-0.5 rounded-full',coStyle[imp.coStatus])}>{imp.coStatus}</span>}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{imp.releaseDate??'-'}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',statusStyle[imp.status])}>{statusLabel[imp.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><TruckIcon className="w-8 h-8 mx-auto mb-2 opacity-30"/>통관 내역이 없습니다.</div>}
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-2">
          {filtered.map(imp=>(
            <div key={imp.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{imp.businessId}</p>
                  <p className="font-semibold text-sm mt-0.5">{imp.shipmentBusinessId}</p>
                </div>
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full',statusStyle[imp.status])}>{statusLabel[imp.status]}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{imp.brokerName??'관세사 미지정'}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">관세</p><p className="font-semibold">{imp.duty?imp.duty.toLocaleString()+'원':'-'}</p></div>
                <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">부가세</p><p className="font-semibold">{imp.vat?imp.vat.toLocaleString()+'원':'-'}</p></div>
                <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">C/O</p><p className="font-semibold">{imp.coStatus??'-'}</p></div>
              </div>
              {imp.releaseDate&&<p className="text-xs text-muted-foreground mt-2">반출일 {imp.releaseDate}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
