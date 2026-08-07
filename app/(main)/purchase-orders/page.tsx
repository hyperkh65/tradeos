'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_PURCHASE_ORDERS } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const statusLabel: Record<string,string> = { draft:'초안', confirmed:'확정', production:'생산', inspection:'검품', shipped:'선적', completed:'완료', cancelled:'취소' };
const statusColor: Record<string,string> = { draft:'bg-gray-100 text-gray-600', confirmed:'bg-blue-100 text-blue-700', production:'bg-yellow-100 text-yellow-700', inspection:'bg-purple-100 text-purple-700', shipped:'bg-cyan-100 text-cyan-700', completed:'bg-green-100 text-green-700', cancelled:'bg-red-100 text-red-600' };

export default function PurchaseOrdersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');

  const statuses = ['전체', ...Array.from(new Set(DEMO_PURCHASE_ORDERS.map(p=>p.status)))];
  const filtered = DEMO_PURCHASE_ORDERS.filter(p => {
    const ms = p.businessId.includes(search)||p.supplierName.includes(search)||p.items.some(i=>i.productName.includes(search));
    const mf = statusFilter==='전체'||p.status===statusFilter;
    return ms&&mf;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="발주" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
            <Input placeholder="발주번호, 업체명 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 overflow-x-auto">
              {statuses.map(s=>(
                <button key={s} onClick={()=>setStatusFilter(s)}
                  className={cn('shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors',
                    statusFilter===s?'bg-primary text-primary-foreground border-primary':'border-border text-muted-foreground hover:border-foreground')}>
                  {s==='전체'?'전체':statusLabel[s]}
                </button>
              ))}
            </div>
            <Button size="sm" className="h-9 gap-1 shrink-0 ml-auto"><Plus className="w-4 h-4"/><span className="hidden sm:inline">새 발주</span></Button>
          </div>
        </div>

        {/* Desktop */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{['발주번호','공급업체','제품','통화/금액','선금/잔금','ETD','상태'].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(po=>(
                <tr key={po.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{po.businessId}</td>
                  <td className="px-4 py-3 text-sm font-medium max-w-[140px] truncate">{po.supplierName}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{po.items.map(i=>`${i.productName}×${i.qty}`).join(', ')}</td>
                  <td className="px-4 py-3 text-sm font-semibold">{po.currency} {po.totalAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {po.depositAmount&&<><span className="text-orange-600">{po.depositAmount.toLocaleString()}</span> / {po.balanceAmount?.toLocaleString()}</>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{po.etd??'-'}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full',statusColor[po.status])}>{statusLabel[po.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><Boxes className="w-8 h-8 mx-auto mb-2 opacity-30"/>발주가 없습니다.</div>}
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-2">
          {filtered.map(po=>(
            <div key={po.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{po.businessId}</p>
                  <p className="font-semibold text-sm mt-0.5">{po.supplierName}</p>
                </div>
                <span className={cn('text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0',statusColor[po.status])}>{statusLabel[po.status]}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate mb-2">{po.items.map(i=>i.productName).join(', ')}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-muted-foreground">총액</p>
                  <p className="font-semibold">{po.currency} {po.totalAmount.toLocaleString()}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-muted-foreground">ETD</p>
                  <p className="font-semibold">{po.etd??'-'}</p>
                </div>
              </div>
            </div>
          ))}
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground">발주가 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
