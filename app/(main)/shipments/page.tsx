'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Ship, Plus, Search, X, Loader2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { Shipment } from '@/types';

const statusStyle: Record<string, string> = { booked: 'bg-blue-100 text-blue-700', departed: 'bg-cyan-100 text-cyan-700', in_transit: 'bg-purple-100 text-purple-700', arrived: 'bg-green-100 text-green-700', customs: 'bg-orange-100 text-orange-700', completed: 'bg-gray-100 text-gray-600' };
const statusLabel: Record<string, string> = { booked: '예약', departed: '출발', in_transit: '운송중', arrived: '도착', customs: '통관', completed: '완료' };
const typeStyle: Record<string, string> = { FCL: 'bg-blue-50 text-blue-700', LCL: 'bg-green-50 text-green-700', AIR: 'bg-purple-50 text-purple-700', COURIER: 'bg-orange-50 text-orange-700' };

function ShipmentModal({ item, onClose, onSave }: { item?: Shipment | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    type: item?.type || 'LCL',
    forwarderName: item?.forwarderName || '',
    origin: (item as any)?.origin || '',
    pol: item?.pol || '',
    pod: item?.pod || '',
    etd: item?.etd || '',
    eta: item?.eta || '',
    vessel: item?.vessel || '',
    voyage: item?.voyage || '',
    blNo: item?.blNo || '',
    cbm: item?.cbm?.toString() || '',
    grossWeight: item?.grossWeight?.toString() || '',
    status: item?.status || 'booked',
    poNo: (item as any)?.poNo || '',
    containerNo: (item as any)?.containerNo || '',
    freightCost: (item as any)?.freightCost?.toString() || '',
    freightCurrency: (item as any)?.freightCurrency || 'USD',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.pol || !form.pod) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        cbm: form.cbm ? Number(form.cbm) : undefined,
        grossWeight: form.grossWeight ? Number(form.grossWeight) : undefined,
        freightCost: form.freightCost ? Number(form.freightCost) : undefined,
      };
      if (item) {
        await fetch(`/api/shipments/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">{item ? '선적 수정' : '선적 등록'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">운송유형</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>LCL</option><option>FCL</option><option>AIR</option><option>COURIER</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">포워더</label>
              <Input value={form.forwarderName} onChange={e => setForm(f => ({ ...f, forwarderName: e.target.value }))} placeholder="한진해운포워딩" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">발주번호 연결</label>
              <Input value={form.poNo} onChange={e => setForm(f => ({ ...f, poNo: e.target.value }))} placeholder="PO-2026-0031" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">출발항 (POL) *</label>
              <Input value={form.pol} onChange={e => setForm(f => ({ ...f, pol: e.target.value }))} placeholder="CNNGB" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">도착항 (POD) *</label>
              <Input value={form.pod} onChange={e => setForm(f => ({ ...f, pod: e.target.value }))} placeholder="KRPUS" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ETD</label>
              <Input type="date" value={form.etd} onChange={e => setForm(f => ({ ...f, etd: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ETA</label>
              <Input type="date" value={form.eta} onChange={e => setForm(f => ({ ...f, eta: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">선박명</label>
              <Input value={form.vessel} onChange={e => setForm(f => ({ ...f, vessel: e.target.value }))} placeholder="EVER GLORY" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">항차</label>
              <Input value={form.voyage} onChange={e => setForm(f => ({ ...f, voyage: e.target.value }))} placeholder="202W34" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">B/L No</label>
            <Input value={form.blNo} onChange={e => setForm(f => ({ ...f, blNo: e.target.value }))} placeholder="HJKU2026083501" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">컨테이너 번호</label>
            <Input value={form.containerNo} onChange={e => setForm(f => ({ ...f, containerNo: e.target.value }))} placeholder="TCKU1234567" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">CBM</label>
              <Input type="number" value={form.cbm} onChange={e => setForm(f => ({ ...f, cbm: e.target.value }))} placeholder="18" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">총중량 (kg)</label>
              <Input type="number" value={form.grossWeight} onChange={e => setForm(f => ({ ...f, grossWeight: e.target.value }))} placeholder="4200" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">운임</label>
              <Input type="number" value={form.freightCost} onChange={e => setForm(f => ({ ...f, freightCost: e.target.value }))} placeholder="1200" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.freightCurrency} onChange={e => setForm(f => ({ ...f, freightCurrency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>USD</option><option>KRW</option><option>EUR</option>
              </select>
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

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item?: Shipment | null }>({ open: false });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/shipments').then(r => r.json());
    if (res.data) setShipments(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('선적을 삭제하시겠습니까?')) return;
    await fetch(`/api/shipments/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = shipments.filter(s =>
    s.businessId.includes(search) || (s.blNo ?? '').includes(search) || (s.vessel ?? '').includes(search)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="선적" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="선적번호, B/L 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" className="h-9 gap-1 ml-auto shrink-0" onClick={() => setModal({ open: true, item: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">선적 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="hidden md:block rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>{['선적번호', '유형', '포워더', '경로', '선박/항차', 'B/L No', 'ETD', 'ETA', '상태', '관리'].map(h => <th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', h === '관리' ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(s => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-medium">{s.businessId}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', typeStyle[s.type])}>{s.type}</span></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">{s.forwarderName ?? '-'}</td>
                      <td className="px-4 py-3 text-xs">{s.pol ?? '-'} → {s.pod ?? '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{s.vessel ? `${s.vessel} / ${s.voyage}` : '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.blNo ?? '-'}</td>
                      <td className="px-4 py-3 text-xs">{s.etd ?? '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{s.eta ?? '-'}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', statusStyle[s.status])}>{statusLabel[s.status]}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: s })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><Ship className="w-8 h-8 mx-auto mb-2 opacity-30" />선적 내역이 없습니다.</div>}
            </div>

            <div className="md:hidden space-y-2">
              {filtered.map(s => (
                <div key={s.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{s.businessId}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', typeStyle[s.type])}>{s.type}</span>
                        <span className="text-sm font-semibold">{s.pol} → {s.pod}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', statusStyle[s.status])}>{statusLabel[s.status]}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: s })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  {s.vessel && <p className="text-xs text-muted-foreground mb-2">🚢 {s.vessel} {s.voyage}</p>}
                  {s.blNo && <p className="text-xs text-muted-foreground font-mono mb-2">B/L: {s.blNo}</p>}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">ETD</p><p className="font-semibold">{s.etd ?? '-'}</p></div>
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">ETA</p><p className="font-semibold">{s.eta ?? '-'}</p></div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">선적 내역이 없습니다.</div>}
            </div>
          </>
        )}
      </div>
      {modal.open && (
        <ShipmentModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
    </div>
  );
}
