'use client';

import { AppHeader } from '@/components/layout/header';
import { DEMO_COMPANIES } from '@/lib/demo-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Globe, Phone, Mail, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const typeColor: Record<string,string> = {
  '공급업체':'bg-blue-50 text-blue-700 border-blue-200',
  '고객사':'bg-green-50 text-green-700 border-green-200',
  '포워더':'bg-purple-50 text-purple-700 border-purple-200',
  '관세사':'bg-orange-50 text-orange-700 border-orange-200',
  '시험기관':'bg-yellow-50 text-yellow-700 border-yellow-200',
  '기타':'bg-gray-50 text-gray-600 border-gray-200',
};

const countryFlag: Record<string,string> = { '중국':'🇨🇳', '한국':'🇰🇷', '일본':'🇯🇵', '미국':'🇺🇸', '독일':'🇩🇪' };

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('전체');

  const types = ['전체', ...Array.from(new Set(DEMO_COMPANIES.map(c => c.type)))];
  const filtered = DEMO_COMPANIES.filter(c => {
    const matchSearch = c.name.includes(search)||(c.nameEn??'').includes(search)|(c.businessId.includes(search));
    const matchType = typeFilter==='전체'||c.type===typeFilter;
    return matchSearch&&matchType;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="거래처" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground"/>
            <Input placeholder="거래처명, 코드 검색..." className="pl-8 h-9" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 overflow-x-auto">
              {types.map(t=>(
                <button key={t} onClick={()=>setTypeFilter(t)}
                  className={cn('shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors',
                    typeFilter===t?'bg-primary text-primary-foreground border-primary':'border-border text-muted-foreground hover:border-foreground')}>
                  {t}
                </button>
              ))}
            </div>
            <Button size="sm" className="h-9 gap-1 shrink-0 ml-auto"><Plus className="w-4 h-4"/><span className="hidden sm:inline">거래처 추가</span></Button>
          </div>
        </div>

        {/* Desktop: Table */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{['코드','거래처명','유형','국가','연락처','이메일'].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c=>(
                <tr key={c.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.businessId}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-sm">{c.name}</p>
                    {c.nameEn&&<p className="text-xs text-muted-foreground">{c.nameEn}</p>}
                  </td>
                  <td className="px-4 py-3"><Badge className={cn('text-xs border',typeColor[c.type])} variant="outline">{c.type}</Badge></td>
                  <td className="px-4 py-3 text-xs">{countryFlag[c.country]??''} {c.country}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.phone??'-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[160px]">{c.email??'-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground"><Building2 className="w-8 h-8 mx-auto mb-2 opacity-30"/>거래처가 없습니다.</div>}
        </div>

        {/* Mobile: Cards */}
        <div className="md:hidden grid grid-cols-1 gap-2">
          {filtered.map(c=>(
            <div key={c.id} className="bg-card border border-border rounded-xl p-4 active:bg-muted/50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{countryFlag[c.country]??'🌐'}</span>
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.businessId}</p>
                </div>
                <Badge className={cn('text-xs border shrink-0',typeColor[c.type])} variant="outline">{c.type}</Badge>
              </div>
              <div className="space-y-1">
                {c.phone&&<div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="w-3.5 h-3.5 shrink-0"/>{c.phone}</div>}
                {c.email&&<div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="w-3.5 h-3.5 shrink-0"/>{c.email}</div>}
              </div>
            </div>
          ))}
          {filtered.length===0&&<div className="py-12 text-center text-sm text-muted-foreground">거래처가 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
