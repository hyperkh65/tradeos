'use client';

import { AppHeader } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Globe, Phone, Mail, Plus, Search, X, Loader2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Company } from '@/types';

const typeColor: Record<string, string> = {
  '공급업체': 'bg-blue-50 text-blue-700 border-blue-200',
  '고객사': 'bg-green-50 text-green-700 border-green-200',
  '포워더': 'bg-purple-50 text-purple-700 border-purple-200',
  '관세사': 'bg-orange-50 text-orange-700 border-orange-200',
  '시험기관': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  '기타': 'bg-gray-50 text-gray-600 border-gray-200',
};
const countryFlag: Record<string, string> = { '중국': '🇨🇳', '한국': '🇰🇷', '일본': '🇯🇵', '미국': '🇺🇸', '독일': '🇩🇪' };
const TYPES = ['공급업체', '고객사', '포워더', '관세사', '시험기관', '기타'];

function CompanyModal({ item, onClose, onSave }: { item?: Company | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    name: item?.name || '',
    nameEn: item?.nameEn || '',
    type: (item?.type || '공급업체') as string,
    country: item?.country || '중국',
    phone: item?.phone || '',
    email: item?.email || '',
    contactPerson: (item as any)?.contactPerson || '',
    businessNo: (item as any)?.businessNo || '',
    ceo: (item as any)?.ceo || '',
    address: (item as any)?.address || '',
    bank: (item as any)?.bank || '',
    accountNo: (item as any)?.accountNo || '',
    currency: (item as any)?.currency || 'USD',
    memo: item?.memo || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    try {
      if (item) {
        await fetch(`/api/companies/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      } else {
        await fetch('/api/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">{item ? '거래처 수정' : '거래처 추가'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">거래처명 *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="(주)한국무역" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">영문명</label>
              <Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Korea Trade Co., Ltd." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">유형 *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">국가</label>
              <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="중국" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">사업자번호</label>
              <Input value={form.businessNo} onChange={e => setForm(f => ({ ...f, businessNo: e.target.value }))} placeholder="000-00-00000" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">대표자</label>
              <Input value={form.ceo} onChange={e => setForm(f => ({ ...f, ceo: e.target.value }))} placeholder="홍길동" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">주소</label>
            <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="서울시 강남구..." />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">담당자</label>
            <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} placeholder="담당자명" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">전화</label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+86-574-xxxx" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">이메일</label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@co.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">거래 통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>USD</option><option>CNY</option><option>KRW</option><option>EUR</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">은행</label>
              <Input value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} placeholder="국민은행" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">계좌번호</label>
            <Input value={form.accountNo} onChange={e => setForm(f => ({ ...f, accountNo: e.target.value }))} placeholder="000-0000-0000" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">메모</label>
            <Input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="비고" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정' : '저장')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [modal, setModal] = useState<{ open: boolean; item?: Company | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/companies').then(r => r.json());
    if (res.data) setCompanies(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('거래처를 삭제하시겠습니까?')) return;
    await fetch(`/api/companies/${id}`, { method: 'DELETE' });
    load();
  };

  const types = ['전체', ...TYPES.filter(t => companies.some(c => c.type === t))];
  const filtered = companies.filter(c => {
    const matchSearch = c.name.includes(search) || (c.nameEn ?? '').includes(search) || c.businessId.includes(search);
    const matchType = typeFilter === '전체' || c.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="거래처" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="거래처명, 코드 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 overflow-x-auto">
              {types.map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={cn('shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors',
                    typeFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
                  {t}
                </button>
              ))}
            </div>
            <Button size="sm" className="h-9 gap-1 shrink-0 ml-auto" onClick={() => setModal({ open: true, item: null })}>
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">거래처 추가</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{['코드', '거래처명', '유형', '국가', '연락처', '이메일', '관리'].map(h => <th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', h === '관리' ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.businessId}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm">{c.name}</p>
                        {c.nameEn && <p className="text-xs text-muted-foreground">{c.nameEn}</p>}
                      </td>
                      <td className="px-4 py-3"><Badge className={cn('text-xs border', typeColor[c.type])} variant="outline">{c.type}</Badge></td>
                      <td className="px-4 py-3 text-xs">{countryFlag[c.country] ?? ''} {c.country}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{c.phone ?? '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[160px]">{c.email ?? '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: c })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />거래처가 없습니다.</div>}
            </div>

            <div className="md:hidden grid grid-cols-1 gap-2">
              {filtered.map(c => (
                <div key={c.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{countryFlag[c.country] ?? '🌐'}</span>
                        <p className="font-semibold text-sm truncate">{c.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.businessId}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge className={cn('text-xs border', typeColor[c.type])} variant="outline">{c.type}</Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: c })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {c.phone && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="w-3.5 h-3.5 shrink-0" />{c.phone}</div>}
                    {c.email && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="w-3.5 h-3.5 shrink-0" />{c.email}</div>}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">거래처가 없습니다.</div>}
            </div>
          </>
        )}
      </div>
      {modal.open && (
        <CompanyModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
