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
  const [writer, setWriter] = useState<{ name: string; department?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/foreign-invoices/${id}`).then(r => r.json()),
      fetch('/api/settings/company').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ]).then(([d, co, me]) => {
      if (d.data) setInv(d.data);
      if (co.data) setCompany(co.data);
      if (me.user) setWriter(me.user);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>로딩 중...</div>;
  if (!inv) return <div style={{ padding: 40, textAlign: 'center' }}>인보이스를 찾을 수 없습니다.</div>;

  const cur = inv.currency || 'USD';
  const sym = SYM[cur] || cur;
  const isForeign = cur !== 'KRW';
  const bankInfo = isForeign ? (company?.bankForeign1 || company?.bank || '') : (company?.bank || '');
  const issuedDate = inv.issuedDate || new Date().toISOString().slice(0, 10);

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 15mm 15mm 15mm 15mm; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Arial', 'Malgun Gothic', sans-serif; color: #1a1a1a; background: white; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #c8cdd5; padding: 6px 10px; font-size: 11.5px; vertical-align: middle; }
        th { background: #f0f4f8; font-weight: 600; white-space: nowrap; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .center { text-align: center; }
        .total-row td { background: #e8f0fe !important; font-weight: 700; font-size: 13px; }
        .print-btn { position: fixed; top: 18px; right: 18px; background: #1e3a5f; color: white; border: none; padding: 10px 22px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
      `}</style>

      <button className="no-print print-btn" onClick={() => window.print()}>🖨 인쇄 / PDF</button>

      <div style={{ padding: '0 0 40px' }}>
        {/* ── 헤더 배너 ── */}
        <div style={{ background: '#1e3a5f', color: 'white', padding: '18px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {company?.logoUrl && (
              <div style={{ background: 'white', borderRadius: 6, padding: '4px 8px' }}>
                <img src={company.logoUrl} alt="logo" style={{ height: 32, objectFit: 'contain', display: 'block' }} />
              </div>
            )}
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>INVOICE</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>외화 청구서</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{inv.businessId}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>Date: {issuedDate}</div>
            {inv.dueDate && <div style={{ fontSize: 11, opacity: 0.8 }}>Due: {inv.dueDate}</div>}
            <div style={{ fontSize: 11, opacity: 0.8 }}>Currency: {cur}</div>
          </div>
        </div>

        {/* ── 회사 정보 3단 ── */}
        <div style={{ padding: '20px 36px', display: 'flex', gap: 20 }}>
          {/* 발행 회사 */}
          <div style={{ flex: 1, border: '1px solid #dde3ed', borderRadius: 6, padding: '12px 16px' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#888', marginBottom: 8, fontWeight: 700 }}>From (발행자)</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{company?.name || ''}</div>
            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.7 }}>
              {company?.address && <div>{company.address}</div>}
              {company?.tel && <div>TEL: {company.tel}{company.fax ? `  FAX: ${company.fax}` : ''}</div>}
              {company?.email && <div>E: {company.email}</div>}
              {company?.bizNo && <div>Business No: {company.bizNo}</div>}
            </div>
          </div>

          {/* 청구 대상 */}
          <div style={{ flex: 1, border: '1px solid #dde3ed', borderRadius: 6, padding: '12px 16px' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#888', marginBottom: 8, fontWeight: 700 }}>Bill To (청구 대상)</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{inv.clientName || '—'}</div>
          </div>

          {/* 금액 요약 */}
          <div style={{ minWidth: 180, border: '2px solid #1e3a5f', borderRadius: 6, padding: '12px 16px', background: '#f7f9fc' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#1e3a5f', marginBottom: 8, fontWeight: 700 }}>Total Amount</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1e3a5f' }}>{sym} {fmt(inv.total, cur)}</div>
            {(inv.vatAmount ?? 0) > 0 && (
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>VAT: {sym} {fmt(inv.vatAmount, cur)}</div>
            )}
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              Status: <span style={{ fontWeight: 600, color: inv.status === 'paid' ? '#16a34a' : inv.status === 'sent' ? '#d97706' : '#555' }}>
                {inv.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* ── 내역 테이블 ── */}
        <div style={{ padding: '0 36px', marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th className="center" style={{ width: 34 }}>No.</th>
                <th>Description (항목)</th>
                <th className="num" style={{ width: 55 }}>Qty</th>
                <th className="center" style={{ width: 48 }}>Unit</th>
                <th className="num" style={{ width: 120 }}>Unit Price ({cur})</th>
                <th className="center" style={{ width: 44 }}>VAT</th>
                <th className="num" style={{ width: 130 }}>Amount ({cur})</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.length > 0 ? inv.items.map((item, i) => (
                <tr key={i}>
                  <td className="center">{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{item.description}</td>
                  <td className="num">{(item.qty ?? 1).toLocaleString()}</td>
                  <td className="center">{item.unit || 'lot'}</td>
                  <td className="num">{fmt(item.unitPrice ?? item.amount, cur)}</td>
                  <td className="center">{item.vatIncluded ? '✓' : '—'}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmt(item.amount, cur)}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="center" style={{ color: '#aaa', padding: 20 }}>No items</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f5f7fa' }}>
                <td colSpan={6} className="num" style={{ fontWeight: 600, color: '#555' }}>Subtotal</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(inv.subtotal, cur)}</td>
              </tr>
              {(inv.vatAmount ?? 0) > 0 && (
                <tr style={{ background: '#fefaf5' }}>
                  <td colSpan={6} className="num" style={{ color: '#666' }}>VAT (10%)</td>
                  <td className="num">{fmt(inv.vatAmount, cur)}</td>
                </tr>
              )}
              <tr className="total-row">
                <td colSpan={6} className="num" style={{ fontSize: 13 }}>TOTAL</td>
                <td className="num" style={{ fontSize: 14 }}>{sym} {fmt(inv.total, cur)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── 수금 정보 (paid 상태) ── */}
        {inv.status === 'paid' && inv.fxRateAtPayment && (
          <div style={{ padding: '0 36px', marginBottom: 16 }}>
            <div style={{ border: '1px solid #d1fae5', borderRadius: 5, padding: '10px 14px', background: '#f0fdf4', fontSize: 11.5, color: '#166534' }}>
              <strong>수금 완료</strong> · 환율: {inv.fxRateAtPayment.toLocaleString()}
              {inv.paidAmountKrw && ` · KRW ₩${inv.paidAmountKrw.toLocaleString()}`}
              {inv.paidAt && ` · 수금일: ${inv.paidAt}`}
            </div>
          </div>
        )}

        {/* ── 비고 + 계좌 ── */}
        <div style={{ padding: '0 36px', display: 'flex', gap: 16, marginBottom: 20 }}>
          {inv.remark && (
            <div style={{ flex: 1, border: '1px solid #e0e6ef', borderRadius: 5, padding: '10px 14px', fontSize: 11.5, color: '#555' }}>
              <strong>Remarks:</strong> {inv.remark}
            </div>
          )}
          {bankInfo && (
            <div style={{ minWidth: 260, border: '1px solid #c8d8f0', borderRadius: 5, padding: '10px 14px', background: '#f5f9ff' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1e3a5f', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                {isForeign ? 'Bank Account (Foreign Remittance)' : '입금 계좌 정보'}
              </div>
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: '#333', fontFamily: 'inherit', lineHeight: 1.6 }}>{bankInfo}</pre>
            </div>
          )}
        </div>

        {/* ── 결재란 + 직인 ── */}
        <div style={{ padding: '0 36px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', marginRight: 12, paddingTop: 8 }}>결재:</div>
            <div style={{ border: '1px solid #aaa', textAlign: 'center', width: 76, padding: '6px 4px' }}>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>작성자</div>
              <div style={{ fontSize: 11, fontWeight: 600, minHeight: 24, paddingTop: 4 }}>{writer?.name || ''}</div>
              {writer?.department && <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>{writer.department}</div>}
            </div>
            <div style={{ border: '1px solid #aaa', borderLeft: 'none', textAlign: 'center', width: 76, padding: '6px 4px' }}>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>검토자</div>
              <div style={{ minHeight: 24 }}></div>
            </div>
            <div style={{ border: '1px solid #aaa', borderLeft: 'none', textAlign: 'center', width: 76, padding: '6px 4px' }}>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>승인자</div>
              <div style={{ minHeight: 24 }}></div>
              <div style={{ fontSize: 8, color: '#bbb', marginTop: 2 }}>전자결재</div>
            </div>
          </div>
          {company?.stampUrl && (
            <img src={company.stampUrl} alt="stamp" style={{ height: 72, objectFit: 'contain', opacity: 0.85 }} />
          )}
        </div>

        <div style={{ padding: '16px 36px 0', fontSize: 10, color: '#bbb', textAlign: 'right' }}>
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
