'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DocumentDeleteButton } from '@/components/documents/DocumentDeleteButton';
import {
  Plus, Search, Loader2, FileSpreadsheet, History, X, Save, Send, Printer, Trash2, FileText,
} from 'lucide-react';

interface RfqItem { name: string; specification: string; qty: number; unit: string; remark: string }
interface RfqData {
  supplierName: string; supplierContact: string; supplierEmail: string; supplierPhone: string; supplierAddress: string;
  validUntil: string; items: RfqItem[]; remark: string;
}
interface DocRow {
  id: string; businessId: string; title: string; status: string;
  data: RfqData; createdAt: string; updatedAt: string;
  history?: Array<{ at: string; by: string; action: string }>;
}
interface Company { id: string; name: string; type: string; email?: string; phone?: string; address?: string; contactPerson?: string }

const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const emptyData = (): RfqData => ({
  supplierName: '', supplierContact: '', supplierEmail: '', supplierPhone: '', supplierAddress: '',
  validUntil: addDays(30),
  items: [{ name: '', specification: '', qty: 0, unit: 'EA', remark: '' }],
  remark: '',
});

export default function RfqPage() {
  const [list, setList] = useState<DocRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [selected, setSelected] = useState<DocRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<RfqData>(emptyData());
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/documents?type=rfq');
      const j = await r.json();
      setList(j.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/companies').then(r => r.json()).then(j => setCompanies(Array.isArray(j.data) ? j.data : []));
  }, []);

  const openNew = () => { setSelected(null); setData(emptyData()); setEditing(true); };
  const openEdit = (doc: DocRow) => { setSelected(doc); setData({ ...emptyData(), ...doc.data }); setEditing(true); };

  const applySupplier = (name: string) => {
    const co = companies.find(c => c.name === name);
    setData(d => ({
      ...d, supplierName: name,
      supplierContact: co?.contactPerson || d.supplierContact,
      supplierEmail: co?.email || d.supplierEmail,
      supplierPhone: co?.phone || d.supplierPhone,
      supplierAddress: co?.address || d.supplierAddress,
    }));
  };

  const handleSave = async (status: 'draft' | 'issued') => {
    if (!data.supplierName.trim()) { alert('공급사(TO)를 입력해주세요.'); return; }
    if (!data.items.some(i => i.name.trim())) { alert('품목을 1개 이상 입력해주세요.'); return; }
    setSaving(true);
    const title = `${data.supplierName} 견적의뢰서`;
    try {
      if (selected) {
        const r = await fetch(`/api/documents/${selected.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, data, status }),
        });
        setSelected((await r.json()).data);
      } else {
        const r = await fetch('/api/documents', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docType: 'rfq', title, data, status }),
        });
        setSelected((await r.json()).data);
      }
      setEditing(false);
      load();
    } finally { setSaving(false); }
  };

  const updateItem = (idx: number, patch: Partial<RfqItem>) => {
    setData(d => ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  };
  const addItem = () => setData(d => ({ ...d, items: [...d.items, { name: '', specification: '', qty: 0, unit: 'EA', remark: '' }] }));
  const removeItem = (idx: number) => setData(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));

  const filtered = list.filter(d => !searchQ || d.title.includes(searchQ) || d.businessId.includes(searchQ));
  const supplierCompanies = companies.filter(c => c.type === '공급업체');

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="견적 의뢰서" />
      <div className="flex-1 flex overflow-hidden">
        <div className={cn('flex flex-col border-r border-border bg-card transition-all', editing ? 'w-72 shrink-0' : 'flex-1 max-w-lg')}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="검색..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            </div>
            <Button size="sm" onClick={openNew} className="shrink-0 h-7 text-xs gap-1"><Plus className="w-3.5 h-3.5" />새 견적서</Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                <FileText className="w-8 h-8 opacity-30" /><span>작성된 견적의뢰서가 없습니다</span>
                <button onClick={openNew} className="text-xs text-blue-500 hover:underline">+ 새 견적서 작성</button>
              </div>
            ) : filtered.map(d => (
              <div key={d.id}
                className={cn('px-3 py-2.5 border-b border-border cursor-pointer hover:bg-muted/40', selected?.id === d.id && !editing && 'bg-blue-50 border-l-2 border-l-blue-500')}
                onClick={() => { setSelected(d); setEditing(false); }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono">{d.businessId}</span>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', d.status === 'issued' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                    {d.status === 'issued' ? '발행' : '작성중'}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{d.createdAt?.slice(0, 10)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium mt-0.5 truncate flex-1 min-w-0">{d.data?.supplierName} ({d.data?.items?.length || 0}개 품목)</div>
                  <DocumentDeleteButton id={d.id} createdAt={d.createdAt} onDeleted={() => { if (selected?.id === d.id) setSelected(null); load(); }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {(selected || editing) && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
              {selected && !editing && (
                <>
                  <span className="text-xs font-mono text-muted-foreground">{selected.businessId}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', selected.status === 'issued' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                    {selected.status === 'issued' ? '발행' : '작성중'}
                  </span>
                  <span className="font-semibold text-sm truncate">{selected.title}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowHistory(true)}><History className="w-3.5 h-3.5" />히스토리</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => window.open(`/api/documents/${selected.id}/excel`, '_blank')}><FileSpreadsheet className="w-3.5 h-3.5" />Excel</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => window.open(`/api/documents/${selected.id}/pdf`, '_blank')}><Printer className="w-3.5 h-3.5" />PDF</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openEdit(selected)}>편집</Button>
                  </div>
                </>
              )}
              {editing && (
                <>
                  <span className="font-semibold text-sm">{selected ? selected.businessId : '새 견적의뢰서 (저장 시 번호 자동부여)'}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditing(false); if (!selected) setSelected(null); }}>취소</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={saving} onClick={() => handleSave('draft')}><Save className="w-3.5 h-3.5" />임시저장</Button>
                    <Button size="sm" className="h-7 text-xs gap-1" disabled={saving} onClick={() => handleSave('issued')}>{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}발행</Button>
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {editing ? (
                <div className="max-w-3xl mx-auto space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">공급사 (TO) *</label>
                      <Input list="rfq-suppliers" value={data.supplierName} onChange={e => applySupplier(e.target.value)} placeholder="공급사명 입력 또는 목록에서 선택" />
                      <datalist id="rfq-suppliers">
                        {supplierCompanies.map(c => <option key={c.id} value={c.name} />)}
                      </datalist>
                    </div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">담당자</label><Input value={data.supplierContact} onChange={e => setData(d => ({ ...d, supplierContact: e.target.value }))} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">전화</label><Input value={data.supplierPhone} onChange={e => setData(d => ({ ...d, supplierPhone: e.target.value }))} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">이메일</label><Input value={data.supplierEmail} onChange={e => setData(d => ({ ...d, supplierEmail: e.target.value }))} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">유효기한</label><Input type="date" value={data.validUntil} onChange={e => setData(d => ({ ...d, validUntil: e.target.value }))} /></div>
                    <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">주소</label><Input value={data.supplierAddress} onChange={e => setData(d => ({ ...d, supplierAddress: e.target.value }))} /></div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold">품목 내역</label>
                      <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={addItem}><Plus className="w-3 h-3" />품목 추가</Button>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="grid grid-cols-[1fr_140px_70px_70px_1fr_28px] gap-0 bg-muted/50 text-[11px] font-semibold px-2 py-1.5">
                        <span>품목</span><span>규격</span><span className="text-right">단위</span><span className="text-right">수량</span><span>비고</span><span />
                      </div>
                      {data.items.map((it, i) => (
                        <div key={i} className="grid grid-cols-[1fr_140px_70px_70px_1fr_28px] gap-1 px-2 py-1.5 border-t border-border items-center">
                          <input className="text-xs px-1.5 py-1 rounded border border-input bg-background" value={it.name} onChange={e => updateItem(i, { name: e.target.value })} placeholder="예: LED 모듈 25W" />
                          <input className="text-xs px-1.5 py-1 rounded border border-input bg-background" value={it.specification} onChange={e => updateItem(i, { specification: e.target.value })} placeholder="규격" />
                          <input className="text-xs px-1.5 py-1 rounded border border-input bg-background text-right" value={it.unit} onChange={e => updateItem(i, { unit: e.target.value })} />
                          <input type="number" className="text-xs px-1.5 py-1 rounded border border-input bg-background text-right" value={it.qty || ''} onChange={e => updateItem(i, { qty: Number(e.target.value) || 0 })} />
                          <input className="text-xs px-1.5 py-1 rounded border border-input bg-background" value={it.remark} onChange={e => updateItem(i, { remark: e.target.value })} placeholder="비고" />
                          <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">요청사항</label>
                    <textarea className="w-full min-h-[80px] text-sm rounded-md border border-input bg-background px-3 py-2"
                      value={data.remark} onChange={e => setData(d => ({ ...d, remark: e.target.value }))} placeholder="예: 최소 주문 수량, 납기, 결제조건 등 요청사항을 입력하세요." />
                  </div>
                </div>
              ) : selected && (
                <div className="max-w-3xl mx-auto bg-white border border-border rounded-lg p-8 text-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div className="text-lg font-bold text-blue-700">견적 의뢰서</div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>Quote No. <b className="text-foreground">{selected.businessId}</b></div>
                      <div>Date {selected.createdAt?.slice(0, 10)}</div>
                      {!!selected.data.validUntil && <div>Valid Until {selected.data.validUntil}</div>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-blue-700 mb-1">TO (공급사)</div>
                      <div className="font-bold">{selected.data.supplierName}</div>
                      {!!selected.data.supplierContact && <div className="text-xs text-muted-foreground">담당자: {selected.data.supplierContact}</div>}
                      {!!selected.data.supplierPhone && <div className="text-xs text-muted-foreground">Tel: {selected.data.supplierPhone}</div>}
                      {!!selected.data.supplierEmail && <div className="text-xs text-muted-foreground">Email: {selected.data.supplierEmail}</div>}
                      {!!selected.data.supplierAddress && <div className="text-xs text-muted-foreground">{selected.data.supplierAddress}</div>}
                    </div>
                  </div>
                  <table className="w-full text-xs border border-border mb-4">
                    <thead className="bg-muted/50">
                      <tr><th className="p-1.5 border-b border-border text-left">품목</th><th className="p-1.5 border-b border-border text-left">규격</th><th className="p-1.5 border-b border-border text-right">단위</th><th className="p-1.5 border-b border-border text-right">수량</th><th className="p-1.5 border-b border-border text-left">비고</th></tr>
                    </thead>
                    <tbody>
                      {selected.data.items.map((it, i) => (
                        <tr key={i} className="border-b border-border/60">
                          <td className="p-1.5">{it.name}</td><td className="p-1.5">{it.specification}</td>
                          <td className="p-1.5 text-right">{it.unit}</td><td className="p-1.5 text-right">{it.qty.toLocaleString()}</td>
                          <td className="p-1.5">{it.remark}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!!selected.data.remark && (
                    <div className="text-xs text-muted-foreground border-t border-border pt-3 whitespace-pre-wrap">{selected.data.remark}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showHistory && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowHistory(false)}>
          <div className="bg-card rounded-xl shadow-xl w-[420px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">변경 히스토리</span>
              <button onClick={() => setShowHistory(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(selected.history || []).slice().reverse().map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs border-b border-border/60 pb-2">
                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{h.action}</span>
                  <span>{h.by}</span>
                  <span className="ml-auto text-muted-foreground">{new Date(h.at).toLocaleString('ko-KR')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
