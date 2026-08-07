'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Plus, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Claim } from '@/types';

const statusStyle: Record<string, string> = { '접수': 'bg-gray-100 text-gray-600', '내부확인': 'bg-blue-100 text-blue-700', '업체전달': 'bg-yellow-100 text-yellow-700', '협상': 'bg-orange-100 text-orange-700', '합의': 'bg-purple-100 text-purple-700', '완료': 'bg-green-100 text-green-700' };
const issueColor: Record<string, string> = { '품질': 'bg-red-50 text-red-700', '수량': 'bg-orange-50 text-orange-700', '파손': 'bg-yellow-50 text-yellow-700', '지연': 'bg-blue-50 text-blue-700', '사양': 'bg-purple-50 text-purple-700', '기타': 'bg-gray-50 text-gray-600' };
const ISSUE_TYPES = ['품질', '수량', '파손', '지연', '사양', '기타'];

function ClaimModal({ onClose, onSave }: { onClose: () => void; onSave: (c: Claim) => void }) {
  const [form, setForm] = useState({ issueType: '품질', description: '', customerName: '', supplierName: '', productName: '', claimAmount: '', currency: 'USD', compensationType: '차감' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description) return;
    setSaving(true);
    try {
      const res = await fetch('/api/claims', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, claimAmount: form.claimAmount ? Number(form.claimAmount) : undefined }) });
      const json = await res.json();
      if (json.data) onSave(json.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">클레임 등록</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">이슈유형</label>
            <select value={form.issueType} onChange={e => setForm(f => ({ ...f, issueType: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">설명 *</label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="수령 제품 중 불량 발견..." required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">고객사</label>
              <Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="(주)한국에너지솔루션" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">공급업체</label>
              <Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="Ningbo Alpha Lighting" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">제품명</label>
            <Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="LED 패널 40W" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">클레임 금액</label>
              <Input type="number" value={form.claimAmount} onChange={e => setForm(f => ({ ...f, claimAmount: e.target.value }))} placeholder="1200" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>USD</option><option>KRW</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">처리방법</label>
            <select value={form.compensationType} onChange={e => setForm(f => ({ ...f, compensationType: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option>차감</option><option>교환</option><option>환불</option><option>재작업</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/claims').then(r => r.json()).then(j => { if (j.data) setClaims(j.data); }).finally(() => setLoading(false));
  }, []);

  const filtered = claims.filter(c =>
    c.businessId.includes(search) || (c.customerName ?? '').includes(search) || (c.productName ?? '').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="클레임" />
      {showModal && <ClaimModal onClose={() => setShowModal(false)} onSave={c => { setClaims(prev => [c, ...prev]); setShowModal(false); }} />}
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="클레임번호, 제품명 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">클레임 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{['번호', '이슈유형', '제품', '고객사', '공급업체', '클레임금액', '처리방법', '상태'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{c.businessId}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', issueColor[c.issueType])}>{c.issueType}</span></td>
                      <td className="px-4 py-3 text-sm font-medium max-w-[140px] truncate">{c.productName ?? '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">{c.customerName ?? '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">{c.supplierName ?? '-'}</td>
                      <td className="px-4 py-3 text-xs font-mono">{c.claimAmount ? `${c.currency ?? 'USD'} ${Number(c.claimAmount).toLocaleString()}` : '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{c.compensationType ?? '-'}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', statusStyle[c.status])}>{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />클레임이 없습니다.</div>}
            </div>

            <div className="md:hidden space-y-2">
              {filtered.map(c => (
                <div key={c.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{c.businessId}</p>
                      <p className="font-semibold text-sm mt-0.5">{c.productName ?? '제품 미지정'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', issueColor[c.issueType])}>{c.issueType}</span>
                      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', statusStyle[c.status])}>{c.status}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-2">{c.description}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{c.customerName ?? ''}</span>
                    {c.claimAmount && <span className="font-semibold">{c.currency ?? 'USD'} {Number(c.claimAmount).toLocaleString()}</span>}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">클레임이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
