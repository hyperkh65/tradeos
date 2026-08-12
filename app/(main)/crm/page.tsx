'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShoppingCart, Plus, Search, X, Pencil, Trash2, Loader2, Printer, Lock, Maximize2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const ADMIN_PASSWORD = '1209';
const SALE_TYPES = ['일반', '직수출', '내수', '샘플', '반품'];

function isPrevMonth(d?: string) {
  if (!d) return false;
  const t = new Date(d), n = new Date();
  return t.getFullYear() < n.getFullYear() || (t.getFullYear() === n.getFullYear() && t.getMonth() < n.getMonth());
}

interface SalesItem { id: string; product: string; specification: string; qty: number; unitPrice: number; amount: number; remark: string; }
interface SalesRecord {
  id: string; businessId: string; saleDate: string; customer: string;
  saleType: string; salesperson?: string; poNo?: string;
  items: SalesItem[]; netAmount: number; vat: number; totalAmount: number;
  currency: string; exchangeRate?: number; misc?: string;
}
interface CompanySettings {
  name: string; ceo: string; bizNo: string; bizType: string; bizItem: string;
  address: string; tel: string; fax: string; email: string;
  bank: string; bankForeign1: string; bankForeign2: string; logoUrl: string; stampUrl: string;
}

const emptyItem = (): SalesItem => ({ id: Date.now().toString() + Math.random(), product: '', specification: '', qty: 1, unitPrice: 0, amount: 0, remark: '' });

function AdminPasswordModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(false);
  const check = () => { if (pw === ADMIN_PASSWORD) onConfirm(); else setErr(true); };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-xl shadow-2xl p-6 w-80">
        <div className="flex items-center gap-2 mb-3"><Lock className="w-5 h-5 text-orange-500" /><h3 className="font-semibold">전월 매출 수정</h3></div>
        <p className="text-sm text-muted-foreground mb-4">전월 매출은 관리자만 수정할 수 있습니다.<br />관리자 비밀번호를 입력하세요.</p>
        <Input type="password" placeholder="비밀번호" value={pw} onChange={e => { setPw(e.target.value); setErr(false); }} onKeyDown={e => e.key === 'Enter' && check()} className={err ? 'border-red-400' : ''} autoFocus />
        {err && <p className="text-xs text-red-500 mt-1">비밀번호가 올바르지 않습니다.</p>}
        <div className="flex gap-2 mt-4"><Button variant="outline" className="flex-1" onClick={onCancel}>취소</Button><Button className="flex-1" onClick={check}>확인</Button></div>
      </div>
    </div>
  );
}

function SpecModal({ value, onSave, onClose }: { value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">규격 입력</h3>
          <button type="button" onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <textarea autoFocus rows={5} value={text} onChange={e => setText(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="규격을 입력하세요..." />
        <div className="flex gap-2 mt-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button type="button" className="flex-1" onClick={() => { onSave(text); onClose(); }}>확인</Button>
        </div>
      </div>
    </div>
  );
}

function SaleModal({ sale, companies, products, sales: allSales, onClose, onSave }: {
  sale?: SalesRecord | null; companies: string[]; products: any[]; sales: SalesRecord[];
  onClose: () => void; onSave: () => void;
}) {
  const [form, setForm] = useState({
    saleDate: sale?.saleDate || new Date().toISOString().slice(0, 10),
    customer: sale?.customer || '',
    saleType: sale?.saleType || '일반',
    salesperson: sale?.salesperson || '',
    poNo: sale?.poNo || '',
    currency: sale?.currency || 'KRW',
    exchangeRate: String(sale?.exchangeRate ?? 1),
    misc: sale?.misc || '',
    items: sale?.items?.length
      ? sale.items.map((i, idx) => ({ ...i, id: String(idx), remark: (i as any).remark || '' }))
      : [emptyItem()],
  });
  const [saving, setSaving] = useState(false);
  const [specModal, setSpecModal] = useState<{ open: boolean; idx: number; value: string }>({ open: false, idx: 0, value: '' });

  const updateItem = (idx: number, field: string, val: string | number) => {
    const items = [...form.items];
    (items[idx] as any)[field] = val;
    if (field === 'qty' || field === 'unitPrice') items[idx].amount = items[idx].qty * items[idx].unitPrice;
    setForm(f => ({ ...f, items }));
  };

  const getRecentPrice = (productName: string) => {
    if (!productName) return null;
    const prices = allSales
      .flatMap(s => s.items.filter(i => i.product === productName).map(i => ({ price: i.unitPrice, date: s.saleDate })))
      .filter(p => p.price > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
    return prices[0]?.price ?? null;
  };

  const rate = Number(form.exchangeRate) || 1;
  const netAmount = form.items.reduce((s, i) => s + i.amount, 0);
  const netKRW = rate === 1 ? netAmount : Math.round(netAmount * rate);
  const vat = Math.round(netKRW * 0.1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer) return;
    setSaving(true);
    try {
      const body = { ...form, exchangeRate: rate, netAmount, vat, totalAmount: netKRW + vat };
      if (sale) await fetch(`/api/sales/${sale.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      else await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="font-semibold">{sale ? '매출 수정' : '매출 등록'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Row 1: 날짜, 거래처, 유형, 담당자 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">매출일자</label>
              <Input type="date" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} /></div>
            <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground mb-1 block">거래처 *</label>
              <Input value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} list="cust-list" required />
              <datalist id="cust-list">{companies.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">매출유형</label>
              <select value={form.saleType} onChange={e => setForm(f => ({ ...f, saleType: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {SALE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">담당자</label>
              <Input value={form.salesperson} onChange={e => setForm(f => ({ ...f, salesperson: e.target.value }))} /></div>
          </div>
          {/* Row 2: PO번호, 통화, 환율, 기타 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">고객 PO번호</label>
              <Input value={form.poNo} onChange={e => setForm(f => ({ ...f, poNo: e.target.value }))} placeholder="PO번호" /></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">통화</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option>KRW</option><option>USD</option><option>CNY</option><option>EUR</option>
              </select></div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                적용환율 <span className="text-[10px] text-muted-foreground/70">(KRW 기준 1이면 국내거래)</span>
              </label>
              <Input type="number" step="0.0001" min="0.0001" value={form.exchangeRate}
                onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} placeholder="1" />
            </div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">기타 사항</label>
              <Input value={form.misc} onChange={e => setForm(f => ({ ...f, misc: e.target.value }))} placeholder="특이사항, 참고사항 등" /></div>
          </div>

          {/* Items */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium w-[200px]">품목명</th>
                  <th className="px-2 py-2 text-left font-medium w-[130px]">규격</th>
                  <th className="px-2 py-2 text-right font-medium w-16">수량</th>
                  <th className="px-2 py-2 text-right font-medium w-36">
                    단가 <span className="text-[9px] text-blue-500 font-normal">(최근↓ 클릭적용)</span>
                  </th>
                  <th className="px-2 py-2 text-right font-medium w-28">금액</th>
                  <th className="px-2 py-2 text-left font-medium w-[110px]">비고</th>
                  <th className="px-2 py-2 w-7"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {form.items.map((item, idx) => {
                  const recentPrice = getRecentPrice(item.product);
                  return (
                    <tr key={item.id} className="hover:bg-muted/20">
                      <td className="px-2 py-1">
                        <input className="w-full bg-transparent border-none outline-none text-xs"
                          value={item.product} onChange={e => updateItem(idx, 'product', e.target.value)}
                          list="prod-list" placeholder="품목명" />
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-0.5">
                          <input className="flex-1 bg-transparent border-none outline-none text-xs min-w-0"
                            value={item.specification} onChange={e => updateItem(idx, 'specification', e.target.value)} placeholder="규격" />
                          <button type="button" title="크게 입력"
                            onClick={() => setSpecModal({ open: true, idx, value: item.specification })}
                            className="shrink-0 text-muted-foreground hover:text-primary">
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" className="w-full bg-transparent border-none outline-none text-xs text-right"
                          value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" step="0.01" className="w-full bg-transparent border-none outline-none text-xs text-right"
                          value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))} />
                        {recentPrice != null && (
                          <div className="text-right">
                            <button type="button"
                              className="text-[9px] text-blue-500 hover:underline cursor-pointer"
                              title="클릭하면 최근 단가 적용"
                              onClick={() => updateItem(idx, 'unitPrice', recentPrice)}>
                              최근: {recentPrice.toLocaleString()}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right font-medium">{item.amount.toLocaleString()}</td>
                      <td className="px-1 py-1">
                        <input className="w-full bg-transparent border-none outline-none text-xs"
                          value={item.remark} onChange={e => updateItem(idx, 'remark', e.target.value)} placeholder="비고" />
                      </td>
                      <td className="px-1 py-1">
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                          className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="prod-list">{products.map(p => <option key={p.id} value={p.nameKo} />)}</datalist>
            <div className="p-2 border-t">
              <button type="button" onClick={() => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> 품목 추가
              </button>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="space-y-1 text-sm w-72">
              <div className="flex justify-between">
                <span className="text-muted-foreground">공급가액</span>
                <span>
                  {netAmount.toLocaleString()}
                  {rate !== 1 && <span className="text-muted-foreground text-xs"> × {rate} = {netKRW.toLocaleString()}원</span>}
                  {rate === 1 && '원'}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">부가세 (10%)</span><span>{vat.toLocaleString()}원</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>합계</span><span>{(netKRW + vat).toLocaleString()}원</span></div>
            </div>
          </div>

          {specModal.open && (
            <SpecModal value={specModal.value}
              onSave={v => updateItem(specModal.idx, 'specification', v)}
              onClose={() => setSpecModal({ open: false, idx: 0, value: '' })} />
          )}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (sale ? '수정 저장' : '매출 등록')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── 거래명세표 인쇄 모달 ───────────────────────────────────────────────── */

function SalePrintModal({ sale, company, onClose }: { sale: SalesRecord; company: CompanySettings; onClose: () => void }) {
  const items = sale.items || [];
  const rate = Number(sale.exchangeRate) || 1;
  const netAmount = items.reduce((s, i) => s + i.amount, 0);
  const netKRW = rate === 1 ? netAmount : Math.round(netAmount * rate);
  const vat = sale.vat ?? Math.round(netKRW * 0.1);
  const total = sale.totalAmount ?? netKRW + vat;

  const handlePrint = () => {
    const orig = document.title;
    const filename = `${sale.businessId}_${sale.customer}_${sale.saleDate}`.replace(/\s/g, '_');
    document.title = filename;
    window.print();
    window.addEventListener('afterprint', () => { document.title = orig; }, { once: true });
  };

  const td: React.CSSProperties = { padding: '5px 6px', border: '1px solid #ddd' };
  const th: React.CSSProperties = { padding: '6px', backgroundColor: '#1a1a2e', color: 'white', border: '1px solid #333', fontWeight: 'bold' };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #sale-print-area, #sale-print-area * { visibility: visible !important; }
          #sale-print-area { position: fixed; left: 0; top: 0; width: 210mm; padding: 10mm !important; box-shadow: none !important; }
          .no-print { display: none !important; }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
      <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[900px]">
          <div className="flex items-center justify-between p-4 border-b no-print">
            <span className="font-semibold text-sm text-gray-800">거래명세표 미리보기</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> 인쇄 / PDF 저장</Button>
              <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>
          </div>

          <div id="sale-print-area" style={{ width: '210mm', minHeight: '297mm', padding: '10mm', background: 'white', fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif', color: '#111', fontSize: '9pt', lineHeight: '1.5', boxSizing: 'border-box' }}>

            {/* 제목 */}
            <div style={{ textAlign: 'center', marginBottom: '14px', borderBottom: '2px solid #1a1a2e', paddingBottom: '10px' }}>
              <div style={{ fontSize: '20pt', fontWeight: 'bold', letterSpacing: '10px', color: '#1a1a2e' }}>거 래 명 세 표</div>
            </div>

            {/* 문서정보 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '8.5pt' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div><span style={{ color: '#666' }}>문서번호: </span><strong>{sale.businessId}</strong></div>
                <div><span style={{ color: '#666' }}>거래일자: </span><strong>{sale.saleDate}</strong></div>
                <div><span style={{ color: '#666' }}>거래유형: </span><strong>{sale.saleType}</strong></div>
              </div>
              {sale.poNo && <div><span style={{ color: '#666' }}>PO번호: </span><strong>{sale.poNo}</strong></div>}
            </div>

            {/* 공급자 / 공급받는자 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div style={{ border: '1.5px solid #333' }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '8pt', background: '#f5f5f8', padding: '5px', borderBottom: '1px solid #ccc', letterSpacing: '3px' }}>공 급 자</div>
                <div style={{ padding: '8px', fontSize: '8pt' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr><td style={{ color: '#666', width: '65px', paddingBottom: '3px', verticalAlign: 'top' }}>상호</td><td style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>{company.name}</td></tr>
                      {company.bizNo && <tr><td style={{ color: '#666', paddingBottom: '3px' }}>사업자번호</td><td>{company.bizNo}</td></tr>}
                      {company.ceo && <tr><td style={{ color: '#666', paddingBottom: '3px' }}>대표자</td><td>{company.ceo}</td></tr>}
                      {company.bizType && <tr><td style={{ color: '#666', paddingBottom: '3px' }}>업태</td><td>{company.bizType}</td></tr>}
                      {company.bizItem && <tr><td style={{ color: '#666', paddingBottom: '3px' }}>종목</td><td>{company.bizItem}</td></tr>}
                      {company.address && <tr><td style={{ color: '#666', paddingBottom: '3px', verticalAlign: 'top' }}>주소</td><td style={{ fontSize: '7.5pt' }}>{company.address}</td></tr>}
                      {company.tel && <tr><td style={{ color: '#666', paddingBottom: '3px' }}>전화</td><td>{company.tel}</td></tr>}
                      {company.fax && <tr><td style={{ color: '#666', paddingBottom: '3px' }}>팩스</td><td>{company.fax}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ border: '1.5px solid #333' }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '8pt', background: '#f5f5f8', padding: '5px', borderBottom: '1px solid #ccc', letterSpacing: '2px' }}>공 급 받 는 자</div>
                <div style={{ padding: '8px', fontSize: '8pt' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr><td style={{ color: '#666', width: '65px', paddingBottom: '3px' }}>상호</td><td style={{ fontWeight: 'bold', fontSize: '11pt' }}>{sale.customer}</td></tr>
                      {sale.salesperson && <tr><td style={{ color: '#666', paddingBottom: '3px' }}>담당자</td><td>{sale.salesperson}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 품목 테이블 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '8.5pt' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'center', width: '28px' }}>No</th>
                  <th style={{ ...th, textAlign: 'left' }}>품 목 명</th>
                  <th style={{ ...th, textAlign: 'left', width: '100px' }}>규 격</th>
                  <th style={{ ...th, textAlign: 'right', width: '45px' }}>수량</th>
                  <th style={{ ...th, textAlign: 'right', width: '80px' }}>단 가</th>
                  <th style={{ ...th, textAlign: 'right', width: '85px' }}>공급가액</th>
                  <th style={{ ...th, textAlign: 'right', width: '70px' }}>세 액</th>
                  <th style={{ ...th, textAlign: 'left', width: '80px' }}>비 고</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const itemVat = Math.round(item.amount * 0.1);
                  return (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: '600' }}>{item.product}</td>
                      <td style={{ ...td, color: '#555', fontSize: '7.5pt' }}>{item.specification}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{item.qty.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{item.unitPrice.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: '600' }}>{item.amount.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{itemVat.toLocaleString()}</td>
                      <td style={{ ...td, fontSize: '7.5pt' }}>{(item as any).remark || ''}</td>
                    </tr>
                  );
                })}
                {items.length < 6 && Array.from({ length: 6 - items.length }).map((_, i) => (
                  <tr key={`e${i}`}>
                    {[...Array(8)].map((_, j) => <td key={j} style={{ ...td, height: '22px' }}></td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #1a1a2e', backgroundColor: '#f0f0f5' }}>
                  <td colSpan={5} style={{ ...td, textAlign: 'right', fontWeight: 'bold' }}>합 계</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 'bold' }}>{netAmount.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 'bold' }}>{vat.toLocaleString()}</td>
                  <td style={td}></td>
                </tr>
              </tfoot>
            </table>

            {/* 합계 박스 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <div style={{ border: '2px solid #1a1a2e', padding: '10px 18px', minWidth: '280px', fontSize: '9pt' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ color: '#555' }}>공급가액</span>
                  <strong>{netAmount.toLocaleString()}원{rate !== 1 ? <span style={{ color: '#888', fontSize: '8pt' }}> (× {rate})</span> : ''}</strong>
                </div>
                {rate !== 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ color: '#555' }}>KRW 공급가액</span>
                    <strong>{netKRW.toLocaleString()}원</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#555' }}>부가세 (10%)</span>
                  <strong>{vat.toLocaleString()}원</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1a1a2e', paddingTop: '7px', fontSize: '12pt' }}>
                  <strong>합 계 금 액</strong>
                  <strong style={{ color: '#1a1a2e' }}>{total.toLocaleString()}원</strong>
                </div>
              </div>
            </div>

            {/* 기타 사항 */}
            {sale.misc && (
              <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '8px 12px', marginBottom: '14px' }}>
                <div style={{ fontWeight: 'bold', color: '#666', marginBottom: '4px', fontSize: '7.5pt', textTransform: 'uppercase', letterSpacing: '1px' }}>기타 사항</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '8.5pt' }}>{sale.misc}</div>
              </div>
            )}

            {/* 계좌 + 서명 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', marginTop: '16px', alignItems: 'end' }}>
              {company.bank ? (
                <div style={{ border: '1px solid #ddd', padding: '8px 12px', fontSize: '8pt' }}>
                  <div style={{ fontWeight: 'bold', color: '#666', marginBottom: '5px', fontSize: '7.5pt', letterSpacing: '1px', textTransform: 'uppercase' }}>입금 계좌</div>
                  <div style={{ whiteSpace: 'pre-line' }}>{company.bank}</div>
                </div>
              ) : <div />}
              <div style={{ textAlign: 'center', minWidth: '150px' }}>
                <div style={{ fontSize: '8pt', color: '#666', marginBottom: '6px' }}>확인자 서명</div>
                {company.stampUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={company.stampUrl} alt="stamp" style={{ height: '65px', objectFit: 'contain', display: 'block', margin: '0 auto 6px' }} />
                  : <div style={{ height: '65px', border: '1px dashed #ccc', borderRadius: '4px', marginBottom: '6px' }} />}
                <div style={{ borderTop: '1px solid #333', paddingTop: '4px', fontSize: '9pt', fontWeight: 'bold' }}>{company.name}</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */

export default function CRMPage() {
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; sale?: SalesRecord | null }>({ open: false });
  const [printModal, setPrintModal] = useState<{ open: boolean; sale?: SalesRecord | null }>({ open: false });
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [adminModal, setAdminModal] = useState<{ open: boolean; action: () => void }>({ open: false, action: () => {} });

  const load = async () => {
    setLoading(true);
    const [sRes, cRes, pRes, csRes] = await Promise.all([
      fetch('/api/sales').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
      fetch('/api/settings/company').then(r => r.json()),
    ]);
    setSales(Array.isArray(sRes.data) ? sRes.data : []);
    setCompanies((Array.isArray(cRes.data) ? cRes.data : []).map((c: any) => c.name));
    setProducts(Array.isArray(pRes.data) ? pRes.data : []);
    if (csRes.data) setCompany(csRes.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const guardEdit = (sale: SalesRecord, action: () => void) => {
    if (isPrevMonth(sale.saleDate)) setAdminModal({ open: true, action });
    else action();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await fetch(`/api/sales/${id}`, { method: 'DELETE' });
    load();
  };

  const handlePrint = (sale: SalesRecord) => {
    setPrintModal({ open: true, sale });
  };

  const filtered = sales.filter(s =>
    s.customer.toLowerCase().includes(search.toLowerCase()) ||
    s.businessId.toLowerCase().includes(search.toLowerCase()) ||
    (s.salesperson ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalNet = filtered.reduce((s, r) => s + r.netAmount, 0);
  const totalVat = filtered.reduce((s, r) => s + r.vat, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="매출 관리" icon={<ShoppingCart className="w-5 h-5" />} />
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        <div className="flex flex-col sm:flex-row gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="거래처, 코드, 담당자 검색..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5">
            <span>공급가: <strong className="text-foreground">{totalNet.toLocaleString()}원</strong></span>
            <span>부가세: <strong className="text-foreground">{totalVat.toLocaleString()}원</strong></span>
            <span>합계: <strong className="text-foreground">{(totalNet + totalVat).toLocaleString()}원</strong></span>
          </div>
          <Button size="sm" className="h-9 gap-1 shrink-0" onClick={() => setModal({ open: true, sale: null })}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">매출 등록</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">거래명세표번호</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">일자</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">거래처</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">유형</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">담당자</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">공급가액</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">부가세</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">합계</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">매출 데이터가 없습니다.</td></tr>
                ) : filtered.map(s => {
                  const prev = isPrevMonth(s.saleDate);
                  return (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          {prev && <Lock className="w-3 h-3 text-orange-400 shrink-0" aria-label="전월 (관리자만 수정)" />}
                          {s.businessId}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm whitespace-nowrap">{s.saleDate}</td>
                      <td className="px-3 py-3 font-medium">{s.customer}</td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs border border-green-200">{s.saleType}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">{s.salesperson || '-'}</td>
                      <td className="px-3 py-3 text-right font-medium whitespace-nowrap">{s.netAmount.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground hidden lg:table-cell whitespace-nowrap">{s.vat.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-bold whitespace-nowrap">{s.totalAmount.toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" title="거래명세표 출력" onClick={() => handlePrint(s)}>
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => guardEdit(s, () => setModal({ open: true, sale: s }))}>
                            {prev && <Lock className="w-3 h-3 text-orange-400 mr-0.5" />}
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => guardEdit(s, () => handleDelete(s.id))}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal.open && (
        <SaleModal
          sale={modal.sale}
          companies={companies}
          products={products}
          sales={sales}
          onClose={() => setModal({ open: false })}
          onSave={() => { setModal({ open: false }); load(); }}
        />
      )}
      {printModal.open && printModal.sale && company && (
        <SalePrintModal sale={printModal.sale} company={company} onClose={() => setPrintModal({ open: false })} />
      )}
      {adminModal.open && (
        <AdminPasswordModal
          onConfirm={() => { setAdminModal({ open: false, action: () => {} }); adminModal.action(); }}
          onCancel={() => setAdminModal({ open: false, action: () => {} })}
        />
      )}
    </div>
  );
}
