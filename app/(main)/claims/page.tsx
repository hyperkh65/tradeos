'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_CLAIMS } from '@/lib/demo-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const statusStyle: Record<string,string> = { '접수':'bg-gray-100 text-gray-600', '내부확인':'bg-blue-100 text-blue-700', '업체전달':'bg-yellow-100 text-yellow-700', '협상':'bg-orange-100 text-orange-700', '합의':'bg-purple-100 text-purple-700', '완료':'bg-green-100 text-green-700' };
const issueColor: Record<string,string> = { '품질':'bg-red-50 text-red-700', '수량':'bg-orange-50 text-orange-700', '파손':'bg-yellow-50 text-yellow-700', '지연':'bg-blue-50 text-blue-700', '사양':'bg-purple-50 text-purple-700', '기타':'bg-gray-50 text-gray-600' };

export default function ClaimsPage() {
  const [search, setSearch] = useState('');
  const filtered = DEMO_CLAIMS.filter(c =>
    c.businessId.includes(search)||(c.customerName??'').includes(search)||(c.productName??'').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="클레임" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
            <Input placeholder="클레임번호, 제품명 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0"><Plus className="w-4 h-4"/><span className="hidden sm:inline">클레임 등록</span></Button>
        </div>

        {/* Desktop */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{['번호','이슈유형','제품','고객사','공급업체','클레임금액','처리방법','상태'].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c=>(
                <tr key={c.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{c.businessId}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',issueColor[c.issueType])}>{c.issueType}</span></td>
                  <td className="px-4 py-3 text-sm font-medium max-w-[140px] truncate">{c.productName??'-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">{c.customerName??'-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">{c.supplierName??'-'}</td>
                  <td className="px-4 py-3 text-xs font-mono">{c.claimAmount?`${c.currency??'USD'} ${c.claimAmount.toLocaleString()}`:'-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.compensationType??'-'}</td>
                  <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',statusStyle[c.status])}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30"/>클레임이 없습니다.</div>}
        </div>

        {/* Mobile */}
        <div className="md:hidden space-y-2">
          {filtered.map(c=>(
            <div key={c.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">{c.businessId}</p>
                  <p className="font-semibold text-sm mt-0.5">{c.productName??'제품 미지정'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full',issueColor[c.issueType])}>{c.issueType}</span>
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full',statusStyle[c.status])}>{c.status}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate mb-2">{c.description}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{c.customerName??''}</span>
                {c.claimAmount&&<span className="font-semibold">{c.currency??'USD'} {c.claimAmount.toLocaleString()}</span>}
              </div>
            </div>
          ))}
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground">클레임이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
