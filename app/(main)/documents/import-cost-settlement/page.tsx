'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Plus, Search, Loader2, Table2, History, X, Save, Send, Printer, Trash2,
} from 'lucide-react';

interface Item { name: string; qty: number; unitPriceCny: number }
interface PaySide { amountCny: number; exchangeRate: number; note: string }
interface SettlementData {
  customerName: string; customerCeo: string; productName: string;
  deliveryLocation: string; paymentCondition: string; paymentMethod: string;
  items: Item[]; advance: PaySide; balance: PaySide;
}
interface DocRow {
  id: string; businessId: string; title: string; status: string;
  data: SettlementData; createdAt: string; updatedAt: string;
  history?: Array<{ at: string; by: string; action: string }>;
}

const emptyData = (): SettlementData => ({
  customerName: '', customerCeo: '', productName: '', deliveryLocation: '고객사 지정',
  paymentCondition: '현금, 물품 수령 후 100% 지급', paymentMethod: '내수거래 (원화 결제 조건, 세금계산서 발행 조건)',
  items: [{ name: '', qty: 0, unitPriceCny: 0 }],
  advance: { amountCny: 0, exchangeRate: 0, note: '' },
  balance: { amountCny: 0, exchangeRate: 0, note: '발행 예정' },
});

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const fmtCny = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function calc(d: SettlementData) {
  const totalQty = d.items.reduce((s, i) => s + (i.qty || 0), 0);
  const totalCny = d.items.reduce((s, i) => s + (i.qty || 0) * (i.unitPriceCny || 0), 0);
  const advNoVat = Math.round((d.advance.amountCny || 0) * (d.advance.exchangeRate || 0));
  const advVat = Math.round(advNoVat * 1.1);
  const balNoVat = Math.round((d.balance.amountCny || 0) * (d.balance.exchangeRate || 0));
  const balVat = Math.round(balNoVat * 1.1);
  return {
    totalQty, totalCny, advNoVat, advVat, balNoVat, balVat,
    totalCnyPay: (d.advance.amountCny || 0) + (d.balance.amountCny || 0),
    totalKrwNoVat: advNoVat + balNoVat, totalKrwVat: advVat + balVat,
    deposit: advVat, settlement: balVat,
  };
}

export default function ImportCostSettlementPage() {
  const [list, setList] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [selected, setSelected] = useState<DocRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<SettlementData>(emptyData());
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/documents?type=import_cost_settlement');
      const j = await r.json();
      setList(j.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setSelected(null); setData(emptyData()); setEditing(true); };
  const openEdit = (doc: DocRow) => { setSelected(doc); setData({ ...emptyData(), ...doc.data }); setEditing(true); };

  const handleSave = async (status: 'draft' | 'issued') => {
    if (!data.customerName.trim()) { alert('고객사를 입력해주세요.'); return; }
    setSaving(true);
    const title = `${data.customerName} 수입물품대금비용정산서`;
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
          body: JSON.stringify({ docType: 'import_cost_settlement', title, data, status }),
        });
        setSelected((await r.json()).data);
      }
      setEditing(false);
      load();
    } finally { setSaving(false); }
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setData(d => ({ ...d, items: d.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  };
  const addItem = () => setData(d => ({ ...d, items: [...d.items, { name: '', qty: 0, unitPriceCny: 0 }] }));
  const removeItem = (idx: number) => setData(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));

  const filtered = list.filter(d => !searchQ || d.title.includes(searchQ) || d.businessId.includes(searchQ));
  const c = calc(data);
  const viewC = selected ? calc(selected.data) : null;

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="수입물품대금비용정산서" />
      <div className="flex-1 flex overflow-hidden">
        <div className={cn('flex flex-col border-r border-border bg-card transition-all', editing ? 'w-72 shrink-0' : 'flex-1 max-w-lg')}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="검색..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            </div>
            <Button size="sm" onClick={openNew} className="shrink-0 h-7 text-xs gap-1"><Plus className="w-3.5 h-3.5" />새 정산서</Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                <Table2 className="w-8 h-8 opacity-30" /><span>작성된 정산서가 없습니다</span>
                <button onClick={openNew} className="text-xs text-blue-500 hover:underline">+ 새 정산서 작성</button>
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
                <div className="text-sm font-medium mt-0.5 truncate">{d.data?.customerName} · {d.data?.productName}</div>
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
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" />인쇄</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openEdit(selected)}>편집</Button>
                  </div>
                </>
              )}
              {editing && (
                <>
                  <span className="font-semibold text-sm">{selected ? selected.businessId : '새 정산서 (저장 시 번호 자동부여)'}</span>
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
                    <div><label className="text-xs text-muted-foreground mb-1 block">고객사</label><Input value={data.customerName} onChange={e => setData(d => ({ ...d, customerName: e.target.value }))} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">대표이사</label><Input value={data.customerCeo} onChange={e => setData(d => ({ ...d, customerCeo: e.target.value }))} /></div>
                    <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">품명</label><Input value={data.productName} onChange={e => setData(d => ({ ...d, productName: e.target.value }))} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">입고지</label><Input value={data.deliveryLocation} onChange={e => setData(d => ({ ...d, deliveryLocation: e.target.value }))} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">지급조건</label><Input value={data.paymentCondition} onChange={e => setData(d => ({ ...d, paymentCondition: e.target.value }))} /></div>
                    <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">지급수단</label><Input value={data.paymentMethod} onChange={e => setData(d => ({ ...d, paymentMethod: e.target.value }))} /></div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold">품목 내역</label>
                      <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={addItem}><Plus className="w-3 h-3" />품목 추가</Button>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="grid grid-cols-[1fr_90px_100px_110px_28px] gap-0 bg-muted/50 text-[11px] font-semibold px-2 py-1.5">
                        <span>품목</span><span className="text-right">수량(PCS)</span><span className="text-right">단가(CNY)</span><span className="text-right">금액(CNY)</span><span />
                      </div>
                      {data.items.map((it, i) => (
                        <div key={i} className="grid grid-cols-[1fr_90px_100px_110px_28px] gap-1 px-2 py-1.5 border-t border-border items-center">
                          <input className="text-xs px-1.5 py-1 rounded border border-input bg-background" value={it.name} onChange={e => updateItem(i, { name: e.target.value })} placeholder="예: LED 모듈 25W 주광색" />
                          <input type="number" className="text-xs px-1.5 py-1 rounded border border-input bg-background text-right" value={it.qty || ''} onChange={e => updateItem(i, { qty: Number(e.target.value) || 0 })} />
                          <input type="number" className="text-xs px-1.5 py-1 rounded border border-input bg-background text-right" value={it.unitPriceCny || ''} onChange={e => updateItem(i, { unitPriceCny: Number(e.target.value) || 0 })} />
                          <span className="text-xs text-right pr-1">{fmtCny((it.qty || 0) * (it.unitPriceCny || 0))}</span>
                          <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                      <div className="grid grid-cols-[1fr_90px_100px_110px_28px] gap-0 px-2 py-1.5 border-t border-border bg-muted/30 text-xs font-semibold">
                        <span>합계</span><span className="text-right">{c.totalQty.toLocaleString()}</span><span /><span className="text-right">{fmtCny(c.totalCny)}</span><span />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-border rounded-lg p-3 space-y-2">
                      <div className="text-xs font-semibold">선금</div>
                      <div><label className="text-[11px] text-muted-foreground">금액(CNY)</label><Input type="number" value={data.advance.amountCny || ''} onChange={e => setData(d => ({ ...d, advance: { ...d.advance, amountCny: Number(e.target.value) || 0 } }))} className="h-8 text-xs" /></div>
                      <div><label className="text-[11px] text-muted-foreground">환율</label><Input type="number" value={data.advance.exchangeRate || ''} onChange={e => setData(d => ({ ...d, advance: { ...d.advance, exchangeRate: Number(e.target.value) || 0 } }))} className="h-8 text-xs" /></div>
                      <div><label className="text-[11px] text-muted-foreground">비고</label><Input value={data.advance.note} onChange={e => setData(d => ({ ...d, advance: { ...d.advance, note: e.target.value } }))} className="h-8 text-xs" placeholder="예: 9월 15일 발행" /></div>
                      <div className="text-[11px] text-muted-foreground pt-1 border-t border-border">부가세제외 {fmt(c.advNoVat)}원 · 부가세포함 <b className="text-foreground">{fmt(c.advVat)}원</b></div>
                    </div>
                    <div className="border border-border rounded-lg p-3 space-y-2">
                      <div className="text-xs font-semibold">잔금</div>
                      <div><label className="text-[11px] text-muted-foreground">금액(CNY)</label><Input type="number" value={data.balance.amountCny || ''} onChange={e => setData(d => ({ ...d, balance: { ...d.balance, amountCny: Number(e.target.value) || 0 } }))} className="h-8 text-xs" /></div>
                      <div><label className="text-[11px] text-muted-foreground">환율</label><Input type="number" value={data.balance.exchangeRate || ''} onChange={e => setData(d => ({ ...d, balance: { ...d.balance, exchangeRate: Number(e.target.value) || 0 } }))} className="h-8 text-xs" /></div>
                      <div><label className="text-[11px] text-muted-foreground">비고</label><Input value={data.balance.note} onChange={e => setData(d => ({ ...d, balance: { ...d.balance, note: e.target.value } }))} className="h-8 text-xs" placeholder="예: 발행 예정" /></div>
                      <div className="text-[11px] text-muted-foreground pt-1 border-t border-border">부가세제외 {fmt(c.balNoVat)}원 · 부가세포함 <b className="text-foreground">{fmt(c.balVat)}원</b></div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 flex items-center justify-between text-sm">
                    <div><span className="text-muted-foreground">보증금(선금)</span> <b>{fmt(c.deposit)}원</b></div>
                    <div><span className="text-muted-foreground">정산액(잔금)</span> <b className="text-blue-700 text-base">{fmt(c.settlement)}원</b></div>
                  </div>
                </div>
              ) : selected && viewC && (
                <div className="max-w-3xl mx-auto bg-white border border-border rounded-lg p-8 text-sm" id="settlement-print-area">
                  <div className="text-center mb-6"><div className="text-lg font-bold">수입물품대금비용정산서</div></div>
                  <p className="mb-4">아래와 같이 수입물품대금비용 정산내역을 안내드립니다.</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mb-4 border border-border rounded p-3">
                    <div>품명: {selected.data.productName}</div>
                    <div>고객사: {selected.data.customerName}</div>
                    <div>수량: {viewC.totalQty.toLocaleString()} 개</div>
                    <div>대표이사: {selected.data.customerCeo}</div>
                    <div>입고지: {selected.data.deliveryLocation}</div>
                    <div>지급조건: {selected.data.paymentCondition}</div>
                    <div className="col-span-2">지급수단: {selected.data.paymentMethod}</div>
                  </div>
                  <div className="flex justify-between rounded bg-blue-50 border border-blue-200 p-3 mb-4">
                    <div>보증금 <b>KRW {fmt(viewC.deposit)}</b></div>
                    <div>정산액 <b className="text-blue-700">KRW {fmt(viewC.settlement)}</b></div>
                  </div>
                  <table className="w-full text-xs border border-border mb-4">
                    <thead className="bg-muted/50"><tr><th className="p-1.5 border-b border-border text-left">품목</th><th className="p-1.5 border-b border-border text-right">수량(PCS)</th><th className="p-1.5 border-b border-border text-right">단가(CNY)</th><th className="p-1.5 border-b border-border text-right">금액(CNY)</th></tr></thead>
                    <tbody>
                      {selected.data.items.map((it, i) => (
                        <tr key={i} className="border-b border-border/60"><td className="p-1.5">{it.name}</td><td className="p-1.5 text-right">{it.qty.toLocaleString()}</td><td className="p-1.5 text-right">{fmtCny(it.unitPriceCny)}</td><td className="p-1.5 text-right">{fmtCny(it.qty * it.unitPriceCny)}</td></tr>
                      ))}
                      <tr className="font-semibold bg-muted/30"><td className="p-1.5">합계</td><td className="p-1.5 text-right">{viewC.totalQty.toLocaleString()}</td><td /><td className="p-1.5 text-right">{fmtCny(viewC.totalCny)}</td></tr>
                    </tbody>
                  </table>
                  <table className="w-full text-xs border border-border">
                    <thead className="bg-muted/50"><tr><th className="p-1.5 border-b border-border text-left">적요</th><th className="p-1.5 border-b border-border text-right">금액(CNY)</th><th className="p-1.5 border-b border-border text-right">환율</th><th className="p-1.5 border-b border-border text-right">부가세제외(KRW)</th><th className="p-1.5 border-b border-border text-right">부가세포함(KRW)</th><th className="p-1.5 border-b border-border text-left">비고</th></tr></thead>
                    <tbody>
                      <tr className="border-b border-border/60"><td className="p-1.5">선금</td><td className="p-1.5 text-right">{fmtCny(selected.data.advance.amountCny)}</td><td className="p-1.5 text-right">{selected.data.advance.exchangeRate}</td><td className="p-1.5 text-right">{fmt(viewC.advNoVat)}</td><td className="p-1.5 text-right">{fmt(viewC.advVat)}</td><td className="p-1.5">{selected.data.advance.note}</td></tr>
                      <tr><td className="p-1.5">잔금</td><td className="p-1.5 text-right">{fmtCny(selected.data.balance.amountCny)}</td><td className="p-1.5 text-right">{selected.data.balance.exchangeRate}</td><td className="p-1.5 text-right">{fmt(viewC.balNoVat)}</td><td className="p-1.5 text-right">{fmt(viewC.balVat)}</td><td className="p-1.5">{selected.data.balance.note}</td></tr>
                      <tr className="font-semibold bg-muted/30"><td className="p-1.5">합계</td><td className="p-1.5 text-right">{fmtCny(viewC.totalCnyPay)}</td><td /><td className="p-1.5 text-right">{fmt(viewC.totalKrwNoVat)}</td><td className="p-1.5 text-right">{fmt(viewC.totalKrwVat)}</td><td /></tr>
                    </tbody>
                  </table>
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
