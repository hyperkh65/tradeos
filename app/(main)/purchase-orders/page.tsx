'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Boxes, X, Loader2, Pencil, Trash2, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { PurchaseOrder } from '@/types';

const statusLabel: Record<string, string> = { draft: '초안', confirmed: '확정', production: '생산', inspection: '검품', shipped: '선적', completed: '완료', cancelled: '취소' };
const statusColor: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', confirmed: 'bg-blue-100 text-blue-700', production: 'bg-yellow-100 text-yellow-700', inspection: 'bg-purple-100 text-purple-700', shipped: 'bg-cyan-100 text-cyan-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-600' };

const emptyItem = () => ({ id: Date.now().toString(), productName: '', specification: '', voltage: '', watts: '', cct: '', qty: 1, unitPrice: 0, amount: 0 });

interface CompanySettings {
  name: string; ceo: string; bizNo: string; bizType: string; bizItem: string;
  address: string; tel: string; fax: string; email: string;
  bank: string; bankForeign1: string; bankForeign2: string;
  logoUrl: string; stampUrl: string;
}

function POModal({ item, onClose, onSave }: { item?: PurchaseOrder | null; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    supplierName: item?.supplierName || '',
    currency: item?.currency || 'USD',
    orderDate: item?.orderDate || new Date().toISOString().slice(0, 10),
    etd: item?.etd || '',
    paymentTerms: item?.paymentTerms || '30% T/T',
    incoterm: item?.incoterm || 'FOB',
    status: (item?.status || 'draft') as string,
    depositRatio: ((item as any)?.depositRatio || '30') as string,
    items: item?.items?.length ? item.items.map((i, idx) => ({
      id: String(idx),
      productName: i.productName,
      specification: (i as any).specification || '',
      voltage: (i as any).voltage || '',
      watts: (i as any).watts || '',
      cct: (i as any).cct || '',
      qty: i.qty,
      unitPrice: i.unitPrice,
      amount: i.qty * i.unitPrice,
    })) : [emptyItem()],
  });
  const [saving, setSaving] = useState(false);

  const updateItem = (idx: number, field: string, val: string | number) => {
    const items = [...form.items];
    (items[idx] as any)[field] = val;
    if (field === 'qty' || field === 'unitPrice') {
      items[idx].amount = items[idx].qty * items[idx].unitPrice;
    }
    setForm(f => ({ ...f, items }));
  };

  const totalAmount = form.items.reduce((s, i) => s + i.amount, 0);
  const depositAmount = Math.round(totalAmount * Number(form.depositRatio) / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName) return;
    setSaving(true);
    try {
      const body = { ...form, items: form.items.map(i => ({ ...i, productName: i.productName, qty: i.qty, unitPrice: i.unitPrice, amount: i.amount })), totalAmount, depositAmount, balanceAmount: totalAmount - depositAmount };
      if (item) {
        await fetch(`/api/purchase-orders/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">{item ? '발주 수정' : '새 발주'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">공급업체 *</label>
              <Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="Ningbo Alpha Lighting" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>USD</option><option>EUR</option><option>KRW</option><option>CNY</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">인코텀</label>
              <select value={form.incoterm} onChange={e => setForm(f => ({ ...f, incoterm: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>FOB</option><option>CIF</option><option>EXW</option><option>DAP</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">발주일</label>
              <Input type="date" value={form.orderDate} onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">선적예정일 (ETD)</label>
              <Input type="date" value={form.etd} onChange={e => setForm(f => ({ ...f, etd: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">결제조건</label>
              <Input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} placeholder="30% T/T" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">선금비율 (%)</label>
              <Input type="number" value={form.depositRatio} onChange={e => setForm(f => ({ ...f, depositRatio: e.target.value }))} placeholder="30" />
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">품목</th>
                  <th className="px-3 py-2 text-left font-medium">규격</th>
                  <th className="px-3 py-2 text-left font-medium w-16">전압</th>
                  <th className="px-3 py-2 text-left font-medium w-14">와트</th>
                  <th className="px-3 py-2 text-left font-medium w-14">CCT</th>
                  <th className="px-3 py-2 text-right font-medium w-14">수량</th>
                  <th className="px-3 py-2 text-right font-medium w-20">단가</th>
                  <th className="px-3 py-2 text-right font-medium w-24">금액</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {form.items.map((it, idx) => (
                  <tr key={it.id}>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={it.productName} onChange={e => updateItem(idx, 'productName', e.target.value)} placeholder="품목명" /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={(it as any).specification} onChange={e => updateItem(idx, 'specification', e.target.value)} /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={(it as any).voltage} onChange={e => updateItem(idx, 'voltage', e.target.value)} placeholder="220V" /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={(it as any).watts} onChange={e => updateItem(idx, 'watts', e.target.value)} placeholder="40W" /></td>
                    <td className="px-2 py-1"><input className="w-full bg-transparent border-none outline-none text-xs" value={(it as any).cct} onChange={e => updateItem(idx, 'cct', e.target.value)} placeholder="4K" /></td>
                    <td className="px-2 py-1"><input type="number" className="w-full bg-transparent border-none outline-none text-xs text-right" value={it.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} /></td>
                    <td className="px-2 py-1"><input type="number" className="w-full bg-transparent border-none outline-none text-xs text-right" value={it.unitPrice} onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))} /></td>
                    <td className="px-2 py-1 text-right font-medium">{it.amount.toLocaleString()}</td>
                    <td className="px-2 py-1"><button type="button" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-2 border-t flex items-center justify-between">
              <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> 품목 추가
              </button>
              <div className="text-xs space-x-4 text-right">
                <span className="text-muted-foreground">총액: <strong className="text-foreground">{form.currency} {totalAmount.toLocaleString()}</strong></span>
                <span className="text-muted-foreground">선금: <strong className="text-orange-600">{depositAmount.toLocaleString()}</strong></span>
                <span className="text-muted-foreground">잔금: <strong className="text-foreground">{(totalAmount - depositAmount).toLocaleString()}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (item ? '수정 저장' : '저장')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function POPrintModal({ po, company, onClose }: { po: PurchaseOrder; company: CompanySettings; onClose: () => void }) {
  const items = (po.items || []) as any[];
  const totalAmount = Number(po.totalAmount) || items.reduce((s: number, i: any) => s + (i.amount || i.unitPrice * i.qty || 0), 0);
  const depositAmount = Number(po.depositAmount) || 0;
  const balanceAmount = Number(po.balanceAmount) || totalAmount - depositAmount;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #po-print-area, #po-print-area * { visibility: visible !important; }
          #po-print-area { position: fixed; left: 0; top: 0; width: 210mm; padding: 15mm !important; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
      <div className="no-print fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[900px]">
          <div className="flex items-center justify-between p-4 border-b no-print">
            <span className="font-semibold text-sm text-gray-800">발주서 미리보기</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> 인쇄 / PDF 저장
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>
          </div>

          <div id="po-print-area" style={{ width: '210mm', minHeight: '297mm', padding: '15mm', background: 'white', fontFamily: 'Arial, sans-serif', color: '#111', fontSize: '9pt', lineHeight: '1.4' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                {company.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={company.logoUrl} alt="logo" style={{ maxHeight: '50px', maxWidth: '160px', objectFit: 'contain' }} />
                ) : (
                  <div style={{ fontSize: '14pt', fontWeight: 'bold', color: '#1a1a2e' }}>{company.name}</div>
                )}
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '22pt', fontWeight: 'bold', letterSpacing: '3px', color: '#1a1a2e' }}>PURCHASE ORDER</div>
              </div>
              <div style={{ textAlign: 'right', flex: 1 }}>
                <div style={{ marginBottom: '4px' }}><span style={{ color: '#666', fontSize: '8pt' }}>PO No. </span><strong>{po.businessId}</strong></div>
                <div style={{ marginBottom: '2px' }}><span style={{ color: '#666', fontSize: '8pt' }}>Date: </span>{po.orderDate || today}</div>
                {po.etd && <div><span style={{ color: '#666', fontSize: '8pt' }}>ETD: </span>{po.etd}</div>}
              </div>
            </div>

            {/* Buyer / Supplier */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Buyer</div>
                <div style={{ fontWeight: 'bold', fontSize: '10pt', marginBottom: '4px' }}>{company.name}</div>
                {company.ceo && <div style={{ marginBottom: '2px' }}>CEO: {company.ceo}</div>}
                {company.bizNo && <div style={{ marginBottom: '2px' }}>Reg. No: {company.bizNo}</div>}
                {company.address && <div style={{ marginBottom: '2px' }}>{company.address}</div>}
                {company.tel && <div style={{ marginBottom: '2px' }}>TEL: {company.tel}</div>}
                {company.fax && <div style={{ marginBottom: '2px' }}>FAX: {company.fax}</div>}
                {company.email && <div>Email: {company.email}</div>}
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Supplier</div>
                <div style={{ fontWeight: 'bold', fontSize: '10pt' }}>{po.supplierName}</div>
              </div>
            </div>

            {/* Items table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '8.5pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#1a1a2e', color: 'white' }}>
                  <th style={{ padding: '7px 8px', textAlign: 'center', width: '28px', borderRight: '1px solid #444' }}>No.</th>
                  <th style={{ padding: '7px 8px', textAlign: 'left', borderRight: '1px solid #444' }}>Description / Model</th>
                  <th style={{ padding: '7px 8px', textAlign: 'center', width: '60px', borderRight: '1px solid #444' }}>Voltage</th>
                  <th style={{ padding: '7px 8px', textAlign: 'center', width: '45px', borderRight: '1px solid #444' }}>Watts</th>
                  <th style={{ padding: '7px 8px', textAlign: 'center', width: '45px', borderRight: '1px solid #444' }}>CCT</th>
                  <th style={{ padding: '7px 8px', textAlign: 'center', width: '40px', borderRight: '1px solid #444' }}>Unit</th>
                  <th style={{ padding: '7px 8px', textAlign: 'right', width: '45px', borderRight: '1px solid #444' }}>Qty</th>
                  <th style={{ padding: '7px 8px', textAlign: 'right', width: '70px', borderRight: '1px solid #444' }}>Unit Price</th>
                  <th style={{ padding: '7px 8px', textAlign: 'right', width: '80px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <div style={{ fontWeight: '600' }}>{it.productName}</div>
                      {it.specification && <div style={{ color: '#555', fontSize: '7.5pt' }}>{it.specification}</div>}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: '#444' }}>{it.voltage || '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: '#444' }}>{it.watts || '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: '#444' }}>{it.cct || '-'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: '#444' }}>pcs</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{(it.qty || it.quantity || 0).toLocaleString()}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{po.currency} {(it.unitPrice || 0).toLocaleString()}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>{(it.amount || (it.unitPrice * (it.qty || it.quantity || 0))).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid #ccc', backgroundColor: '#f9f9f9' }}>
                  <td colSpan={8} style={{ padding: '6px 8px', textAlign: 'right', color: '#555' }}>Sub Total</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{po.currency} {totalAmount.toLocaleString()}</td>
                </tr>
                {depositAmount > 0 && <>
                  <tr style={{ backgroundColor: '#fff8f0' }}>
                    <td colSpan={8} style={{ padding: '6px 8px', textAlign: 'right', color: '#c05000' }}>Deposit (선금)</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#c05000' }}>{po.currency} {depositAmount.toLocaleString()}</td>
                  </tr>
                  <tr style={{ backgroundColor: '#f0f8ff' }}>
                    <td colSpan={8} style={{ padding: '6px 8px', textAlign: 'right', color: '#1a50a0' }}>Balance (잔금)</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1a50a0' }}>{po.currency} {balanceAmount.toLocaleString()}</td>
                  </tr>
                </>}
                <tr style={{ borderTop: '2px solid #1a1a2e', backgroundColor: '#f0f0f5' }}>
                  <td colSpan={8} style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', fontSize: '10pt' }}>GRAND TOTAL</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', fontSize: '10pt' }}>{po.currency} {totalAmount.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>

            {/* Terms & Bank */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '6px', textTransform: 'uppercase' }}>Terms & Conditions</div>
                {po.paymentTerms && <div style={{ marginBottom: '3px' }}>Payment: {po.paymentTerms}</div>}
                {po.incoterm && <div style={{ marginBottom: '3px' }}>Incoterm: {po.incoterm}</div>}
                {po.orderDate && <div style={{ marginBottom: '3px' }}>Order Date: {po.orderDate}</div>}
                {po.etd && <div>ETD: {po.etd}</div>}
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '8pt', color: '#666', marginBottom: '6px', textTransform: 'uppercase' }}>Remittance Information</div>
                {company.bankForeign1 ? (
                  <div style={{ fontFamily: 'monospace', fontSize: '8pt', whiteSpace: 'pre-line' }}>{company.bankForeign1}</div>
                ) : company.bank ? (
                  <div style={{ fontSize: '8pt', whiteSpace: 'pre-line' }}>{company.bank}</div>
                ) : null}
              </div>
            </div>

            {/* Signature */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <div style={{ textAlign: 'center', minWidth: '160px' }}>
                <div style={{ fontSize: '8pt', color: '#666', marginBottom: '8px' }}>Authorized Signature</div>
                {company.stampUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={company.stampUrl} alt="stamp" style={{ height: '70px', objectFit: 'contain', display: 'block', margin: '0 auto 8px' }} />
                ) : (
                  <div style={{ height: '70px', border: '1px dashed #ccc', borderRadius: '4px', marginBottom: '8px' }} />
                )}
                <div style={{ borderTop: '1px solid #333', paddingTop: '4px', fontSize: '9pt', fontWeight: 'bold' }}>{company.name}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [modal, setModal] = useState<{ open: boolean; item?: PurchaseOrder | null }>({ open: false });
  const [printModal, setPrintModal] = useState<{ open: boolean; item?: PurchaseOrder | null }>({ open: false });
  const [company, setCompany] = useState<CompanySettings | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/purchase-orders').then(r => r.json());
    if (res.data) setPos(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('발주를 삭제하시겠습니까?')) return;
    await fetch(`/api/purchase-orders/${id}`, { method: 'DELETE' });
    load();
  };

  const handlePrint = async (po: PurchaseOrder) => {
    if (!company) {
      const res = await fetch('/api/settings/company').then(r => r.json());
      setCompany(res.data);
    }
    setPrintModal({ open: true, item: po });
  };

  const statuses = ['전체', ...Object.keys(statusLabel).filter(s => pos.some(p => p.status === s))];
  const filtered = pos.filter(p => {
    const ms = p.businessId.includes(search) || p.supplierName.includes(search) || p.items.some(i => i.productName.includes(search));
    const mf = statusFilter === '전체' || p.status === statusFilter;
    return ms && mf;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="발주" />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="발주번호, 업체명 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 overflow-x-auto">
              {statuses.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn('shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors',
                    statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground')}>
                  {s === '전체' ? '전체' : statusLabel[s]}
                </button>
              ))}
            </div>
            <Button size="sm" className="h-9 gap-1 shrink-0 ml-auto" onClick={() => setModal({ open: true, item: null })}>
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">새 발주</span>
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
                  <tr>{['발주번호', '공급업체', '제품', '통화/금액', '선금/잔금', 'ETD', '상태', '관리'].map(h => <th key={h} className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', h === '관리' ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(po => (
                    <tr key={po.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-medium">{po.businessId}</td>
                      <td className="px-4 py-3 text-sm font-medium max-w-[140px] truncate">{po.supplierName}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{po.items.map(i => `${i.productName}×${i.qty}`).join(', ')}</td>
                      <td className="px-4 py-3 text-sm font-semibold">{po.currency} {Number(po.totalAmount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {po.depositAmount && <><span className="text-orange-600">{Number(po.depositAmount).toLocaleString()}</span> / {Number(po.balanceAmount).toLocaleString()}</>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{po.etd ?? '-'}</td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full', statusColor[po.status])}>{statusLabel[po.status]}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" title="발주서 출력" onClick={() => handlePrint(po)}><Printer className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: po })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(po.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground"><Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" />발주가 없습니다.</div>}
            </div>

            <div className="md:hidden space-y-2">
              {filtered.map(po => (
                <div key={po.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{po.businessId}</p>
                      <p className="font-semibold text-sm mt-0.5">{po.supplierName}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={cn('text-[11px] font-semibold px-2.5 py-0.5 rounded-full', statusColor[po.status])}>{statusLabel[po.status]}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => handlePrint(po)}><Printer className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModal({ open: true, item: po })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(po.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-2">{po.items.map(i => i.productName).join(', ')}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">총액</p><p className="font-semibold">{po.currency} {Number(po.totalAmount).toLocaleString()}</p></div>
                    <div className="bg-muted/50 rounded-lg p-2"><p className="text-muted-foreground">ETD</p><p className="font-semibold">{po.etd ?? '-'}</p></div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">발주가 없습니다.</div>}
            </div>
          </>
        )}
      </div>
      {modal.open && (
        <POModal item={modal.item} onClose={() => setModal({ open: false })} onSave={() => { setModal({ open: false }); load(); }} />
      )}
      {printModal.open && printModal.item && company && (
        <POPrintModal po={printModal.item} company={company} onClose={() => setPrintModal({ open: false })} />
      )}
    </div>
  );
}
