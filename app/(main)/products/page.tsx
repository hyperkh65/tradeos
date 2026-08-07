'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_PRODUCTS } from '@/lib/demo-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const filtered = DEMO_PRODUCTS.filter(p =>
    p.nameKo.includes(search)||(p.nameEn??'').includes(search)|p.code.includes(search)||(p.supplierName??'').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="제품" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
            <Input placeholder="제품명, 코드 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0"><Plus className="w-4 h-4"/><span className="hidden sm:inline">제품 등록</span></Button>
        </div>

        {/* Desktop */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{['코드','제품명','카테고리','공급업체','구매단가','판매단가','MOQ','리드타임'].map(h=><th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground',['구매단가','판매단가'].includes(h)?'text-right':'text-left')}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(p=>(
                <tr key={p.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.nameKo}</p>
                    {p.nameEn&&<p className="text-xs text-muted-foreground">{p.nameEn}</p>}
                  </td>
                  <td className="px-4 py-3"><Badge variant="secondary" className="text-xs">{p.category??'-'}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px] truncate">{p.supplierName??'-'}</td>
                  <td className="px-4 py-3 text-right text-xs font-mono">{p.purchasePrice?`${p.currency} ${p.purchasePrice.toFixed(2)}`:'-'}</td>
                  <td className="px-4 py-3 text-right text-xs font-mono">{p.sellingPrice?`₩${p.sellingPrice.toLocaleString()}`:'-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.moq?p.moq.toLocaleString():'-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.leadTimeDays?`${p.leadTimeDays}일`:'-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><Package className="w-8 h-8 mx-auto mb-2 opacity-30"/>제품이 없습니다.</div>}
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-2">
          {filtered.map(p=>(
            <div key={p.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{p.code}</p>
                  <p className="font-semibold text-sm mt-0.5">{p.nameKo}</p>
                  {p.nameEn&&<p className="text-xs text-muted-foreground">{p.nameEn}</p>}
                </div>
                {p.category&&<Badge variant="secondary" className="text-xs shrink-0">{p.category}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mb-2">{p.supplierName}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-muted-foreground">구매단가</p>
                  <p className="font-semibold">{p.purchasePrice?`$${p.purchasePrice}`:'-'}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-muted-foreground">판매단가</p>
                  <p className="font-semibold">{p.sellingPrice?`₩${p.sellingPrice.toLocaleString()}`:'-'}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-muted-foreground">MOQ</p>
                  <p className="font-semibold">{p.moq?.toLocaleString()??'-'}</p>
                </div>
              </div>
            </div>
          ))}
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground">제품이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
