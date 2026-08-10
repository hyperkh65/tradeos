'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TruckIcon, Plus, Search, X, Loader2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Import } from '@/types';

const statusStyle: Record<string, string> = { in_progress: 'bg-blue-100 text-blue-700', declared: 'bg-yellow-100 text-yellow-700', released: 'bg-purple-100 text-purple-700', completed: 'bg-green-100 text-green-700' };
const statusLabel: Record<string, string> = { in_progress: '진행중', declared: '신고', released: '반출', completed: '완료' };
const coStyle: Record<string, string> = { '수령': 'bg-green-50 text-green-700', '미수령': 'bg-orange-50 text-orange-700', '불필요': 'bg-gray-50 text-gray-600' };

function ImportModal({ item, onClose, onSave }: { item?: Import | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    shipmentBusinessId: item?.shipmentBusinessId || '',
    brokerName: item?.brokerName || '',
    declarationNo: item?.declarationNo || '',
    releaseDate: item?.releaseDate || '',
    hsCode: item?.hsCode || '',
    dutyRate: item?.dutyRate?.toString() || '',
    duty: item?.duty?.toString() || '',
    vat: item?.vat?.toString() || '',
    brokerFee: item?.brokerFee?.toString() || '',
    ftaApplicable: item?.ftaApplicable || false,
    coStatus: (item?.coStatus || '미수령') as string,
    status: (item?.status || 'in_progress') as string,
    invoiceValue: (item as any)?.invoiceValue?.toString() || '',
    invoiceCurrency: ((item as any)?.invoiceCurrency || 'USD') as string,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shipmentBusinessId) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        dutyRate: form.dutyRate ? Number(form.dutyRate) : undefined,
        duty: form.duty ? Number(form.duty) : undefined,
        vat: form.vat ? Number(form.vat) : undefined,
        brokerFee: form.brokerFee ? Number(form.brokerFee) : undefined,
        invoiceValue: form.invoiceValue ? Number(form.invoiceValue) : undefined,
      };
      if (item) {
        await fetch(`/api/imports/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, shipmentId: '' }) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">{item ? '통관 수정' : '통관 등록'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">선적번호 *</label>
              <Input value={form.shipmentBusinessId} onChange={e => setForm(f => ({ ...f, shipmentBusinessId: e.target.value }))} placeholder="SHP-2026-0035" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">관세사</label>
            <Input value={form.brokerName} onChange={e => setForm(f => ({ ...f, brokerName: e.target.value }))} placeholder="관세법인 대한" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">신고번호</label>
              <Input value={form.declarationNo} onChange={e => setForm(f => ({ ...f, declarationNo: e.target.value }))} placeholder="2026-KRPUS-071024" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">반출일</label>
              <Input type="date" value={form.releaseDate} onChange={e => setForm(f => ({ ...f, releaseDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">인보이스 금액</label>
              <Input type="number" value={form.invoiceValue} onChange={e => setForm(f => ({ ...f, invoiceValue: e.target.value }))} placeholder="15000" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.invoiceCurrency} onChange={e => setForm(f => ({ ...f, invoiceCurrency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>USD</option><option>CNY</option><option>EUR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">HS Code</label>
              <Input value={form.hsCode} onChange={e => setForm(f => ({ ...f, hsCode: e.target.value }))} placeholder="9405.10" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">관세율 (%)</label>
              <Input type="number" value={form.dutyRate} onChange={e => setForm(f => ({ ...f, dutyRate: e.target.value }))} placeholder="8" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">관세 (원)</label>
              <Input type="number" value={form.duty} onChange={e => setForm(f => ({ ...f, duty: e.target.value }))} placeholder="576000" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">부가세 (원)</label>
              <Input type="number" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} placeholder="637000" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통관비 (원)</label>
              <Input type="number" value={form.brokerFee} onChange={e => setForm(f => ({ ...f, brokerFee: e.target.value }))} placeholder="150000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">C/O 상태</label>
              <select value={form.coStatus} onChange={e => setForm(f => ({ ...f, coStatus: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>미수령</option><option>수령</option><option>불필요</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.ftaApplicable} onChange={e => setForm(f => ({ ...f, ftaApplicable: e.target.checked }))} className="w-4 h-4" />
                <span className="text-sm">FTA 적용</span>
              </label>
            </div>
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

export default function ImportsPage() {
  const [imports, setImports] = useState<Import[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item?: Import | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/imports').then(r => r.json());
    if (res.data) setImports(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('통관 내역을 삭제하시겠습니까?')) return;
    await fetch(`/api/imports/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = imports.filter(i =>
    i.businessId.includes(search) || i.shipmentBusinessId.includes(search) || (i.declarationNo ?? '').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="수입통관" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="통관번호, 선적번호 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">통관 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{['통관번호', '선적', '관세사', '관세', '부가세', 'C/O', '반출일', '상태', '관리'].map(h => <th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', ['관세', '부가세'].includes(h) ? 'text-right' : h === '관리' ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(imp => (
                    <tr key={imp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{imp.businessId}</td>
                      <td className="px-4 py-3 text-xs font-medium">{imp.shipmentBusinessId}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{imp.brokerName ?? '-'}</td>
                      <td className="px-4 py-3 text-right text-xs">{imp.duty ? Number(imp.duty).toLocaleString() + '원' : '-'}</td>
                      <td className="px-4 py-3 text-right text-xs">{imp.vat ? Number(imp.vat).toLocaleString() + '원' : '-'}</td>
                      <td className="px-4 py-3">{imp.coStatus && <span className={cn('text-xs px-2 py-0.5 rounded-full', coStyle[imp.coStatus])}>{imp.coStatus}</span>}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{imp.releaseDate ?? '-'}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusStyle[imp.status])}>{statusLabel[imp.status]}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: imp })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(imp.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><TruckIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />통관 내역이 없습니다.</div>}
            </div>

            <div className="md:hidden space-y-2">
              {filtered.map(imp => (
                <div key={imp.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{imp.businessId}</p>
                      <p className="font-semibold text-sm mt-0.5">{imp.shipmentBusinessId}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', statusStyle[imp.status])}>{statusLabel[imp.status]}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: imp })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(imp.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{imp.brokerName ?? '관세사 미지정'}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">관세</p><p className="font-semibold">{imp.duty ? Number(imp.duty).toLocaleString() + '원' : '-'}</p></div>
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">부가세</p><p className="font-semibold">{imp.vat ? Number(imp.vat).toLocaleString() + '원' : '-'}</p></div>
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">C/O</p><p className="font-semibold">{imp.coStatus ?? '-'}</p></div>
                  </div>
                  {imp.releaseDate && <p className="text-xs text-muted-foreground mt-2">반출일 {imp.releaseDate}</p>}
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">통관 내역이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
      {modal.open && (
        <ImportModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
