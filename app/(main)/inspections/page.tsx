'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_INSPECTIONS } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckSquare, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const resultStyle: Record<string,string> = { PASS:'bg-green-100 text-green-700', CONDITIONAL_PASS:'bg-yellow-100 text-yellow-700', FAIL:'bg-red-100 text-red-700', PENDING:'bg-gray-100 text-gray-600' };
const resultLabel: Record<string,string> = { PASS:'PASS', CONDITIONAL_PASS:'조건부 PASS', FAIL:'FAIL', PENDING:'대기' };
const statusStyle: Record<string,string> = { scheduled:'bg-blue-50 text-blue-700', in_progress:'bg-yellow-50 text-yellow-700', completed:'bg-green-50 text-green-700' };
const statusLabel: Record<string,string> = { scheduled:'예정', in_progress:'진행중', completed:'완료' };

export default function InspectionsPage() {
  const [search, setSearch] = useState('');
  const filtered = DEMO_INSPECTIONS.filter(q =>
    q.businessId.includes(search)||q.productName.includes(search)||q.supplierName.includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="검품" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
            <Input placeholder="검품번호, 제품명 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0"><Plus className="w-4 h-4"/><span className="hidden sm:inline">검품 등록</span></Button>
        </div>

        {/* Desktop */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{['검품번호','발주','공급업체','제품','검품일','샘플/불량','결과','상태'].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(qc=>(
                <tr key={qc.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{qc.businessId}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{qc.poBusinessId}</td>
                  <td className="px-4 py-3 text-xs max-w-[120px] truncate">{qc.supplierName}</td>
                  <td className="px-4 py-3 text-sm font-medium max-w-[160px] truncate">{qc.productName}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{qc.inspectionDate}</td>
                  <td className="px-4 py-3 text-xs">
                    {(qc.checkedQty??0)>0?<><span className="font-medium">{qc.checkedQty}</span> / <span className="text-red-600">{qc.failedQty??0}</span>{qc.defectRate!==undefined&&` (${qc.defectRate}%)`}</>:'-'}
                  </td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',resultStyle[qc.result])}>{resultLabel[qc.result]}</span></td>
                  <td className="px-4 py-3"><span className={cn('text-xs px-2 py-0.5 rounded-full',statusStyle[qc.status])}>{statusLabel[qc.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-30"/>검품 내역이 없습니다.</div>}
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-2">
          {filtered.map(qc=>(
            <div key={qc.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{qc.businessId}</p>
                  <p className="font-semibold text-sm mt-0.5">{qc.productName}</p>
                  <p className="text-xs text-muted-foreground">{qc.supplierName}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full',resultStyle[qc.result])}>{resultLabel[qc.result]}</span>
                  <span className={cn('text-[11px] px-2 py-0.5 rounded-full',statusStyle[qc.status])}>{statusLabel[qc.status]}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{qc.inspectionDate}</span>
                {(qc.checkedQty??0)>0&&<span>샘플 {qc.checkedQty} / 불량 <span className="text-red-600 font-medium">{qc.failedQty??0}</span>{qc.defectRate!==undefined&&` (${qc.defectRate}%)`}</span>}
              </div>
              {qc.summary&&<p className="text-xs text-muted-foreground mt-2 bg-muted/50 rounded-lg px-3 py-2">{qc.summary}</p>}
            </div>
          ))}
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground">검품 내역이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
