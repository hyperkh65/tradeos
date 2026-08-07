'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckSquare, Plus, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Inspection } from '@/types';

const resultStyle: Record<string, string> = { PASS: 'bg-green-100 text-green-700', CONDITIONAL_PASS: 'bg-yellow-100 text-yellow-700', FAIL: 'bg-red-100 text-red-700', PENDING: 'bg-gray-100 text-gray-600' };
const resultLabel: Record<string, string> = { PASS: 'PASS', CONDITIONAL_PASS: '조건부 PASS', FAIL: 'FAIL', PENDING: '대기' };
const statusStyle: Record<string, string> = { scheduled: 'bg-blue-50 text-blue-700', in_progress: 'bg-yellow-50 text-yellow-700', completed: 'bg-green-50 text-green-700' };
const statusLabel: Record<string, string> = { scheduled: '예정', in_progress: '진행중', completed: '완료' };

function InspectionModal({ onClose, onSave }: { onClose: () => void; onSave: (i: Inspection) => void }) {
  const [form, setForm] = useState({ supplierName: '', productName: '', poId: '', poBusinessId: '', inspectionDate: new Date().toISOString().slice(0, 10), inspector: '', sampleQty: '', inspectionType: '공장검품' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName || !form.productName) return;
    setSaving(true);
    try {
      const res = await fetch('/api/inspections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sampleQty: Number(form.sampleQty) }) });
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
          <h2 className="font-semibold">검품 등록</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">공급업체 *</label>
            <Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="Ningbo Alpha Lighting" required />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">제품명 *</label>
            <Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="LED 패널 40W" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">발주번호</label>
              <Input value={form.poBusinessId} onChange={e => setForm(f => ({ ...f, poBusinessId: e.target.value }))} placeholder="PO-2026-0031" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">검품유형</label>
              <select value={form.inspectionType} onChange={e => setForm(f => ({ ...f, inspectionType: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>공장검품</option><option>입고검품</option><option>선적전검품</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">검품일</label>
              <Input type="date" value={form.inspectionDate} onChange={e => setForm(f => ({ ...f, inspectionDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">샘플수량</label>
              <Input type="number" value={form.sampleQty} onChange={e => setForm(f => ({ ...f, sampleQty: e.target.value }))} placeholder="80" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">검품자</label>
            <Input value={form.inspector} onChange={e => setForm(f => ({ ...f, inspector: e.target.value }))} placeholder="박검품" />
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

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/inspections').then(r => r.json()).then(j => { if (j.data) setInspections(j.data); }).finally(() => setLoading(false));
  }, []);

  const filtered = inspections.filter(q =>
    q.businessId.includes(search) || q.productName.includes(search) || q.supplierName.includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="검품" />
      {showModal && <InspectionModal onClose={() => setShowModal(false)} onSave={i => { setInspections(prev => [i, ...prev]); setShowModal(false); }} />}
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="검품번호, 제품명 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">검품 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{['검품번호', '발주', '공급업체', '제품', '검품일', '샘플/불량', '결과', '상태'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(qc => (
                    <tr key={qc.id} className="hover:bg-muted/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{qc.businessId}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{qc.poBusinessId}</td>
                      <td className="px-4 py-3 text-xs max-w-[120px] truncate">{qc.supplierName}</td>
                      <td className="px-4 py-3 text-sm font-medium max-w-[160px] truncate">{qc.productName}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{qc.inspectionDate}</td>
                      <td className="px-4 py-3 text-xs">
                        {(qc.checkedQty ?? 0) > 0 ? <><span className="font-medium">{qc.checkedQty}</span> / <span className="text-red-600">{qc.failedQty ?? 0}</span>{qc.defectRate !== undefined && ` (${qc.defectRate}%)`}</> : '-'}
                      </td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', resultStyle[qc.result])}>{resultLabel[qc.result]}</span></td>
                      <td className="px-4 py-3"><span className={cn('text-xs px-2 py-0.5 rounded-full', statusStyle[qc.status])}>{statusLabel[qc.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />검품 내역이 없습니다.</div>}
            </div>

            <div className="md:hidden space-y-2">
              {filtered.map(qc => (
                <div key={qc.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{qc.businessId}</p>
                      <p className="font-semibold text-sm mt-0.5">{qc.productName}</p>
                      <p className="text-xs text-muted-foreground">{qc.supplierName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', resultStyle[qc.result])}>{resultLabel[qc.result]}</span>
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full', statusStyle[qc.status])}>{statusLabel[qc.status]}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{qc.inspectionDate}</span>
                    {(qc.checkedQty ?? 0) > 0 && <span>샘플 {qc.checkedQty} / 불량 <span className="text-red-600 font-medium">{qc.failedQty ?? 0}</span>{qc.defectRate !== undefined && ` (${qc.defectRate}%)`}</span>}
                  </div>
                  {qc.summary && <p className="text-xs text-muted-foreground mt-2 bg-muted/50 rounded-lg px-3 py-2">{qc.summary}</p>}
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">검품 내역이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
