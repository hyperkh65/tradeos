'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_SHIPMENTS } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Ship, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const statusStyle: Record<string,string> = { booked:'bg-blue-100 text-blue-700', departed:'bg-cyan-100 text-cyan-700', in_transit:'bg-purple-100 text-purple-700', arrived:'bg-green-100 text-green-700', customs:'bg-orange-100 text-orange-700', completed:'bg-gray-100 text-gray-600' };
const statusLabel: Record<string,string> = { booked:'예약', departed:'출발', in_transit:'운송중', arrived:'도착', customs:'통관', completed:'완료' };
const typeStyle: Record<string,string> = { FCL:'bg-blue-50 text-blue-700', LCL:'bg-green-50 text-green-700', AIR:'bg-purple-50 text-purple-700', COURIER:'bg-orange-50 text-orange-700' };

export default function ShipmentsPage() {
  const [search, setSearch] = useState('');
  const filtered = DEMO_SHIPMENTS.filter(s =>
    s.businessId.includes(search)||(s.blNo??'').includes(search)||(s.vessel??'').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="선적" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
            <Input placeholder="선적번호, B/L 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0"><Plus className="w-4 h-4"/><span className="hidden sm:inline">선적 등록</span></Button>
        </div>

        {/* Desktop */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{['선적번호','유형','포워더','경로','선박/항차','B/L No','ETD','ETA','상태'].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(s=>(
                <tr key={s.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{s.businessId}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',typeStyle[s.type])}>{s.type}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">{s.forwarderName??'-'}</td>
                  <td className="px-4 py-3 text-xs">{s.pol??'-'} → {s.pod??'-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{s.vessel?`${s.vessel} / ${s.voyage}`:'-'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.blNo??'-'}</td>
                  <td className="px-4 py-3 text-xs">{s.etd??'-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{s.eta??'-'}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',statusStyle[s.status])}>{statusLabel[s.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><Ship className="w-8 h-8 mx-auto mb-2 opacity-30"/>선적 내역이 없습니다.</div>}
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-2">
          {filtered.map(s=>(
            <div key={s.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{s.businessId}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',typeStyle[s.type])}>{s.type}</span>
                    <span className="text-sm font-semibold">{s.pol} → {s.pod}</span>
                  </div>
                </div>
                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0',statusStyle[s.status])}>{statusLabel[s.status]}</span>
              </div>
              {s.vessel&&<p className="text-xs text-muted-foreground mb-2">🚢 {s.vessel} {s.voyage}</p>}
              {s.blNo&&<p className="text-xs text-muted-foreground font-mono mb-2">B/L: {s.blNo}</p>}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">ETD</p><p className="font-semibold">{s.etd??'-'}</p></div>
                <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">ETA</p><p className="font-semibold">{s.eta??'-'}</p></div>
              </div>
            </div>
          ))}
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground">선적 내역이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
