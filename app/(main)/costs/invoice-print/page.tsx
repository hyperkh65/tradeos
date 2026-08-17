'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ForeignInvoice } from '@/app/api/foreign-invoices/route';

interface CompanySettings {
  name: string; ceo: string; bizNo: string; bizType: string; bizItem: string;
  address: string; tel: string; fax: string; email: string;
  bank: string; bankForeign1: string; bankForeign2: string;
  logoUrl: string; stampUrl: string;
}

interface ClientInfo {
  name: string; nameEn?: string; address?: string;
  phone?: string; email?: string; contactPerson?: string;
  businessNo?: string; country?: string;
}

const SYM: Record<string, string> = { KRW: '₩', USD: '$', CNY: '¥', EUR: '€', JPY: '¥' };

function fmt(n: number, cur: string) {
  if (cur === 'KRW') return n.toLocaleString('ko-KR');
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function InvoicePrintContent() {
  const params = useSearchParams();
  const id = params.get('id');
  const [inv, setInv] = useState<ForeignInvoice | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/foreign-invoices/${id}`).then(r => r.json()),
      fetch('/api/settings/company').then(r => r.json()),
    ]).then(([d, co]) => {
      if (d.data) setInv(d.data);
      if (co.data) setCompany(co.data);
      if (d.data?.clientId) {
        fetch(`/api/companies/${d.data.clientId}`).then(r => r.json()).then(j => {
          if (j.data) setClient(j.data);
        });
      }
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>로딩 중...</div>;
  if (!inv) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>인보이스를 찾을 수 없습니다.</div>;

  const cur = inv.currency || 'USD';
  const sym = SYM[cur] || cur;
  const isForeign = cur !== 'KRW';
  const bankInfo = isForeign ? (company?.bankForeign1 || company?.bank || '') : (company?.bank || '');
  const issuedDate = inv.issuedDate || new Date().toISOString().slice(0, 10);
  const dateStr = new Date(issuedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const clientName = client?.nameEn || client?.name || inv.clientName || '—';
  const emptyRows = Math.max(0, 8 - inv.items.length);

  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&display=swap');
        @media print {
          body * { visibility: hidden !important; }
          #inv-print-area, #inv-print-area * { visibility: visible !important; }
          #inv-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 210mm !important; min-height: 297mm !important; margin: 0 !important; padding: 10mm !important; z-index: 9999 !important; background: white !important; box-sizing: border-box !important; }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
        #inv-print-area { font-family: 'Noto Sans KR', 'Arial', sans-serif; color: #171717; }
        #inv-print-area .inv-table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        #inv-print-area .inv-table th { text-align: center; border-top: 2px solid #171717; border-bottom: 1px solid #171717; padding: 9px 4px; font-size: 11px; font-weight: 700; color: #171717; background: #f9f9f9; text-transform: uppercase; }
        #inv-print-area .inv-table td { border-bottom: 1px solid #e5e5e5; padding: 10px 4px; font-size: 11px; color: #333; vertical-align: middle; }
        #inv-print-area .inv-table tbody tr:last-child td { border-bottom: 2px solid #171717; }
        #inv-print-area .box-container { display: flex; gap: 28px; margin-bottom: 28px; }
        #inv-print-area .box { flex: 1; border: 1px solid #e5e5e5; padding: 18px 20px; border-radius: 8px; position: relative; }
        #inv-print-area .box-gray { flex: 1; background: #fafafa; border: none; padding: 18px 20px; border-radius: 8px; position: relative; }
        #inv-print-area .box-title { position: absolute; top: -10px; left: 15px; background: white; padding: 0 8px; font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1.5px; }
        #inv-print-area .box-title-gray { position: absolute; top: -10px; left: 15px; background: #fafafa; padding: 0 8px; font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1.5px; }
        #inv-print-area .box-content { font-size: 12.5px; line-height: 1.65; color: #333; }
        .print-btn { position: fixed; top: 20px; right: 20px; background: #171717; color: white; border: none; padding: 10px 22px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; z-index: 100; }
        .print-btn:hover { background: #333; }
      `}</style>

      <button className="no-print print-btn" onClick={() => {
        const orig = document.title;
        document.title = inv.businessId;
        window.print();
        window.addEventListener('afterprint', () => { document.title = orig; }, { once: true });
      }}>🖨 PDF 인쇄</button>

      <div id="inv-print-area" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', background: 'white', padding: '10mm', boxSizing: 'border-box', position: 'relative' }}>

        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '44px' }}>
          <div style={{ width: '28%' }}>
            {company?.logoUrl ? (
              <img src={company.logoUrl} alt="Logo" style={{ height: '44px', objectFit: 'contain', display: 'block' }} />
            ) : (
              <div style={{ fontSize: '16px', fontWeight: 800 }}>{company?.name || ''}</div>
            )}
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <h1 style={{ fontSize: '30px', fontWeight: 900, letterSpacing: '5px', margin: '0 0 4px', color: '#171717' }}>INVOICE</h1>
            <div style={{ fontSize: '12px', color: '#888', letterSpacing: '1px' }}>외화 청구서</div>
            <div style={{ width: '36px', height: '3px', background: '#171717', margin: '14px auto 0' }} />
          </div>
          <div style={{ width: '28%', textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reference No.</div>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>{inv.businessId}</div>
            <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#333', marginBottom: '8px' }}>{dateStr}</div>
            {inv.dueDate && (
              <>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Due Date</div>
                <div style={{ fontSize: '13px', color: '#333' }}>{inv.dueDate}</div>
              </>
            )}
            <div style={{ marginTop: 8 }}>
              <span style={{
                display: 'inline-block', padding: '2px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                background: inv.status === 'paid' ? '#dcfce7' : '#f3f4f6',
                color: inv.status === 'paid' ? '#16a34a' : '#555',
                border: '1px solid ' + (inv.status === 'paid' ? '#86efac' : '#e5e7eb'),
              }}>
                {inv.status === 'paid' ? 'PAID' : inv.status === 'sent' ? 'SENT' : 'DRAFT'}
              </span>
            </div>
          </div>
        </div>

        {/* ── From / To ── */}
        <div className="box-container">
          <div className="box-gray">
            <div className="box-title-gray">From (Seller)</div>
            <div className="box-content">
              <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '8px', color: '#171717' }}>{company?.name || ''}</div>
              {company?.address && <div style={{ marginBottom: '2px' }}>{company.address}</div>}
              {(company?.tel || company?.fax) && <div style={{ marginBottom: '2px' }}>Tel: {company?.tel}{company?.fax ? ` / Fax: ${company.fax}` : ''}</div>}
              {company?.email && <div style={{ marginBottom: '2px' }}>Email: {company.email}</div>}
              {company?.bizNo && <div>Reg.No: {company.bizNo}</div>}
            </div>
          </div>
          <div className="box">
            <div className="box-title">Bill To (Buyer)</div>
            <div className="box-content">
              <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '8px', color: '#171717' }}>{clientName}</div>
              {client?.nameEn && client?.name && client.name !== client.nameEn && (
                <div style={{ fontSize: '13px', color: '#555', marginBottom: '4px' }}>{client.name}</div>
              )}
              {client?.address && <div style={{ marginBottom: '2px' }}>{client.address}</div>}
              {client?.country && <div style={{ marginBottom: '2px' }}>{client.country}</div>}
              {client?.phone && <div style={{ marginBottom: '2px' }}>Tel: {client.phone}</div>}
              {client?.email && <div style={{ marginBottom: '2px' }}>Email: {client.email}</div>}
              {client?.contactPerson && <div style={{ marginBottom: '2px' }}>Attn: <strong>{client.contactPerson}</strong></div>}
              {!client && inv.clientName && <div style={{ color: '#555' }}>{inv.clientName}</div>}
            </div>
          </div>
        </div>

        {/* ── 내역 테이블 ── */}
        <table className="inv-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>No</th>
              <th style={{ textAlign: 'left', paddingLeft: '10px' }}>Description / 항목</th>
              <th style={{ width: '8%' }}>Unit</th>
              <th style={{ width: '8%' }}>Qty</th>
              <th style={{ width: '14%', textAlign: 'right', paddingRight: '8px' }}>Unit Price ({cur})</th>
              <th style={{ width: '6%', textAlign: 'center' }}>VAT</th>
              <th style={{ width: '16%', textAlign: 'right', paddingRight: '8px' }}>Amount ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((item, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center', color: '#888' }}>{i + 1}</td>
                <td style={{ paddingLeft: '10px' }}>
                  <div style={{ fontWeight: 600, color: '#171717' }}>{item.description}</div>
                </td>
                <td style={{ textAlign: 'center' }}>{item.unit || 'lot'}</td>
                <td style={{ textAlign: 'center', fontWeight: 600 }}>{(item.qty ?? 1).toLocaleString()}</td>
                <td style={{ textAlign: 'right', paddingRight: '8px' }}>{fmt(item.unitPrice ?? item.amount, cur)}</td>
                <td style={{ textAlign: 'center' }}>{item.vatIncluded ? '✓' : '—'}</td>
                <td style={{ textAlign: 'right', paddingRight: '8px', fontWeight: 700, color: '#171717' }}>{fmt(item.amount, cur)}</td>
              </tr>
            ))}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`e${i}`}><td style={{ padding: '14px' }} /><td /><td /><td /><td /><td /><td /></tr>
            ))}
          </tbody>
        </table>

        {/* ── Grand Total ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px', marginBottom: '36px' }}>
          {(inv.vatAmount ?? 0) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginRight: '32px' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>VAT (10%)</div>
              <div style={{ fontSize: '15px', color: '#555' }}>{sym} {fmt(inv.vatAmount, cur)}</div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#555', textTransform: 'uppercase' }}>Grand Total ({cur})</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#171717' }}>{sym} {fmt(inv.total, cur)}</div>
          </div>
        </div>

        {/* ── Terms & Bank / Signature ── */}
        <div style={{ display: 'flex', gap: '28px', marginTop: '8px' }}>
          <div style={{ flex: 1 }}>
            {inv.remark && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#171717', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remarks</div>
                <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.7', borderTop: '1px solid #e5e5e5', paddingTop: '8px', whiteSpace: 'pre-wrap' }}>{inv.remark}</div>
              </div>
            )}
            {bankInfo && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#171717', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {isForeign ? 'Remittance Account' : '입금 계좌'}
                </div>
                <div style={{ fontSize: '12px', color: '#444', lineHeight: '1.7', borderTop: '1px solid #e5e5e5', paddingTop: '8px', background: '#f5f5f5', padding: '10px 12px', borderRadius: '5px', fontFamily: 'monospace', whiteSpace: 'pre-line' }}>{bankInfo}</div>
              </div>
            )}

            {/* 수금 완료 정보 */}
            {inv.status === 'paid' && inv.paidAt && (
              <div style={{ marginTop: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px', padding: '8px 12px', fontSize: '11.5px', color: '#166534' }}>
                <strong>수금 완료</strong>
                {inv.fxRateAtPayment && ` · 환율: ${inv.fxRateAtPayment.toLocaleString()}`}
                {inv.paidAmountKrw && ` · ₩${inv.paidAmountKrw.toLocaleString()}`}
                {` · 수금일: ${inv.paidAt}`}
              </div>
            )}
          </div>

          {/* Signature */}
          <div style={{ width: '240px', display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#171717', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Authorized Signature</div>
            <div style={{ flex: 1, borderBottom: '2px solid #171717', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '120px' }}>
              {company?.stampUrl && (
                <img src={company.stampUrl} alt="Stamp" style={{ width: '180px', opacity: 0.85, transform: 'rotate(-5deg)', position: 'absolute' }} />
              )}
            </div>
            <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, marginTop: '8px', color: '#171717' }}>{company?.name || ''}</div>
          </div>
        </div>

        <div style={{ marginTop: '24px', borderTop: '1px solid #e5e5e5', paddingTop: '10px', fontSize: '10px', color: '#bbb', textAlign: 'center' }}>
          This document is electronically issued · {company?.name || ''} · {issuedDate}
        </div>
      </div>
    </div>
  );
}

export default function InvoicePrintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>로딩 중...</div>}>
      <InvoicePrintContent />
    </Suspense>
  );
}
