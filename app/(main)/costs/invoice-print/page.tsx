'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ForeignInvoice } from '@/app/api/foreign-invoices/route';

function InvoicePrintContent() {
  const params = useSearchParams();
  const id = params.get('id');
  const [inv, setInv] = useState<ForeignInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    fetch(`/api/foreign-invoices/${id}`)
      .then(r => r.json())
      .then(d => { if (d.data) setInv(d.data); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>로딩 중...</div>;
  if (!inv) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>인보이스를 찾을 수 없습니다.</div>;

  return (
    <div>
      <style>{`
        @media print { body { -webkit-print-color-adjust: exact; } .no-print { display: none !important; } }
        * { box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; margin: 0; color: #1a1a1a; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; font-size: 12px; }
        th { background: #f5f7fa; font-weight: 600; text-align: left; }
        .total-row { background: #f0f4ff !important; font-weight: 700; }
        .print-btn { position: fixed; top: 20px; right: 20px; background: #1e3a5f; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
      `}</style>

      <button className="print-btn no-print" onClick={() => window.print()}>🖨 PDF 인쇄</button>

      <div style={{ padding: '40px 50px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1e3a5f', letterSpacing: 2 }}>INVOICE</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>청구서</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{inv.businessId}</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>발행일: {inv.issuedDate}</div>
            {inv.dueDate && <div style={{ fontSize: 12, color: '#555' }}>결제기한: {inv.dueDate}</div>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#888', marginBottom: 8, letterSpacing: 1 }}>청구 대상 (Bill To)</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{inv.clientName || '-'}</div>
          </div>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#888', marginBottom: 8, letterSpacing: 1 }}>결제 정보 (Payment)</div>
            <div style={{ fontSize: 12 }}>통화: <strong>{inv.currency}</strong></div>
            {inv.status === 'paid' && inv.fxRateAtPayment && (
              <div style={{ fontSize: 12, marginTop: 4 }}>수금 환율: {inv.fxRateAtPayment.toLocaleString()}</div>
            )}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>No.</th>
              <th>항목 (Description)</th>
              <th style={{ width: 120, textAlign: 'right' }}>금액 ({inv.currency})</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((item, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td>{item.description}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={2} style={{ textAlign: 'right' }}>TOTAL</td>
              <td style={{ textAlign: 'right', fontSize: 14 }}>
                {inv.currency} {inv.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>

        {inv.remark && (
          <div style={{ marginTop: 20, padding: '10px 14px', border: '1px solid #eee', borderRadius: 6, fontSize: 12, color: '#555' }}>
            <strong>비고:</strong> {inv.remark}
          </div>
        )}

        <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa' }}>
          <div>발행일: {new Date().toLocaleDateString('ko-KR')}</div>
          <div>이 문서는 전자 문서입니다.</div>
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
