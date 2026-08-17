'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PurchaseOrder } from '@/types';

const fmtNum = (n: number | undefined, currency: string) => {
  if (!n) return '-';
  return currency === 'KRW'
    ? n.toLocaleString('ko-KR')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function POPrintContent() {
  const params = useSearchParams();
  const id = params.get('id');
  const [po, setPo] = useState<(PurchaseOrder & { imagesJson?: string; depositRatio?: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    fetch(`/api/purchase-orders?id=${encodeURIComponent(id)}&skipNotion=1`)
      .then(r => r.json())
      .then(d => { if (d.data?.[0]) setPo(d.data[0]); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>로딩 중...</div>;
  if (!po) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>발주서를 찾을 수 없습니다.</div>;

  const cur = po.currency || 'USD';
  const total = po.items?.reduce((s, i) => s + (i.amount || 0), 0) || po.totalAmount;
  const depositRatio = parseInt(po.depositRatio || '30', 10);
  const depositAmt = po.depositAmount ?? Math.round(total * depositRatio / 100);
  const balanceAmt = po.balanceAmount ?? (total - depositAmt);

  return (
    <div>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; color: #1a1a1a; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 6px 10px; font-size: 12px; }
        th { background: #f5f7fa; font-weight: 600; text-align: left; }
        .header-row { background: #1e3a5f; color: white; padding: 20px 30px; display: flex; align-items: center; justify-content: space-between; }
        .content { padding: 24px 30px; }
        .title { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
        .subtitle { font-size: 12px; margin-top: 2px; opacity: 0.8; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .info-box { border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px 16px; }
        .info-box h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin: 0 0 8px; }
        .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
        .info-label { color: #666; }
        .info-value { font-weight: 600; }
        .section-title { font-size: 13px; font-weight: 700; margin: 16px 0 8px; border-bottom: 2px solid #1e3a5f; padding-bottom: 4px; }
        .total-row { background: #f0f4ff !important; font-weight: 700; }
        .payment-box { border: 1px solid #c8d8f0; border-radius: 6px; padding: 12px 16px; background: #f0f6ff; margin-top: 16px; }
        .payment-box h4 { font-size: 10px; text-transform: uppercase; color: #1e3a5f; margin: 0 0 8px; font-weight: 700; }
        .payment-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
        .print-btn { position: fixed; top: 20px; right: 20px; background: #1e3a5f; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; z-index: 100; }
        .print-btn:hover { background: #2a4f82; }
      `}</style>

      <button className="print-btn no-print" onClick={() => window.print()}>🖨 PDF 인쇄</button>

      <div className="header-row">
        <div>
          <div className="title">PURCHASE ORDER</div>
          <div className="subtitle">발주서</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{po.businessId}</div>
          {po.piNumber && <div style={{ opacity: 0.8 }}>PI No: {po.piNumber}</div>}
          <div style={{ opacity: 0.8 }}>{po.orderDate}</div>
        </div>
      </div>

      <div className="content">
        <div className="info-grid">
          <div className="info-box">
            <h4>공급업체 (Supplier)</h4>
            <div className="info-row"><span className="info-label">업체명</span><span className="info-value">{po.supplierName}</span></div>
            {po.incoterm && <div className="info-row"><span className="info-label">인코텀즈</span><span className="info-value">{po.incoterm}</span></div>}
          </div>
          <div className="info-box">
            <h4>발주 정보</h4>
            <div className="info-row"><span className="info-label">발주일</span><span className="info-value">{po.orderDate}</span></div>
            {po.productionDueDate && <div className="info-row"><span className="info-label">생산완료</span><span className="info-value">{po.productionDueDate}</span></div>}
            {po.inspectionDate && <div className="info-row"><span className="info-label">검품일</span><span className="info-value">{po.inspectionDate}</span></div>}
            {po.etd && <div className="info-row"><span className="info-label">ETD</span><span className="info-value">{po.etd}</span></div>}
          </div>
        </div>

        <div className="section-title">품목 내역 (Item Details)</div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>No.</th>
              <th>품목명 (Description)</th>
              <th style={{ width: 120 }}>규격 (Specification)</th>
              <th style={{ width: 50, textAlign: 'right' }}>Unit</th>
              <th style={{ width: 60, textAlign: 'right' }}>Qty</th>
              <th style={{ width: 100, textAlign: 'right' }}>Unit Price ({cur})</th>
              <th style={{ width: 110, textAlign: 'right' }}>Amount ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {po.items?.map((item, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{item.productName}</td>
                <td style={{ fontSize: 11, color: '#555' }}>{item.specification || '-'}</td>
                <td style={{ textAlign: 'right' }}>{(item as any).unit || 'PCS'}</td>
                <td style={{ textAlign: 'right' }}>{item.qty?.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{fmtNum(item.unitPrice, cur)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(item.amount, cur)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={5} />
              <td style={{ textAlign: 'right' }}>TOTAL</td>
              <td style={{ textAlign: 'right', fontSize: 14 }}>{cur} {fmtNum(total, cur)}</td>
            </tr>
          </tbody>
        </table>

        <div className="payment-box">
          <h4>결제 조건 (Payment Terms)</h4>
          {po.paymentTerms && (
            <div className="payment-row"><span style={{ color: '#555' }}>결제방식</span><span style={{ fontWeight: 600 }}>{po.paymentTerms}</span></div>
          )}
          <div className="payment-row">
            <span style={{ color: '#555' }}>선금 {depositRatio}% (Deposit)</span>
            <span style={{ fontWeight: 700, color: '#1e3a5f' }}>{cur} {fmtNum(depositAmt, cur)}</span>
          </div>
          <div className="payment-row">
            <span style={{ color: '#555' }}>잔금 {100 - depositRatio}% (Balance)</span>
            <span style={{ fontWeight: 700, color: '#1e3a5f' }}>{cur} {fmtNum(balanceAmt, cur)}</span>
          </div>
        </div>

        {po.remark && (
          <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#555' }}>
            <strong style={{ color: '#333' }}>비고 (Remark):</strong> {po.remark}
          </div>
        )}

        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888' }}>
          <div>발행: {new Date().toLocaleDateString('ko-KR')}</div>
          <div>이 문서는 전자 문서입니다.</div>
        </div>
      </div>
    </div>
  );
}

export default function POPrintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>로딩 중...</div>}>
      <POPrintContent />
    </Suspense>
  );
}
