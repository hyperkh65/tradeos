'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CostRecord, CostLineItem } from '@/app/api/cost-records/route';

const COST_TYPE_LABELS: Record<string, string> = {
  certification: '인증비', as_service: 'A/S 현장 비용',
};

function CertPrintContent() {
  const params = useSearchParams();
  const id = params.get('id');
  const [record, setRecord] = useState<CostRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    fetch(`/api/cost-records/${id}`)
      .then(r => r.json())
      .then(d => { if (d.data) setRecord(d.data); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>로딩 중...</div>;
  if (!record) return <div style={{ padding: 40, textAlign: 'center' }}>항목을 찾을 수 없습니다.</div>;

  const items: CostLineItem[] = record.lineItems || [];
  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const vatItems = items.filter(i => i.vatIncluded);
  const vatTotal = vatItems.reduce((s, i) => s + Math.round((i.amount / 1.1) * 0.1 * 100) / 100, 0);
  const grandTotal = subtotal;

  const typeLabel = COST_TYPE_LABELS[record.costType] || record.costType;
  const issuedDate = new Date().toLocaleDateString('ko-KR');

  return (
    <div>
      <style>{`
        @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; } }
        * { box-sizing: border-box; }
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', Arial, sans-serif; margin: 0; color: #1a1a1a; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #bbb; padding: 6px 10px; font-size: 12px; vertical-align: middle; }
        th { background: #f0f4f8; font-weight: 600; text-align: center; white-space: nowrap; }
        .num { text-align: right; }
        .center { text-align: center; }
        .total-row { background: #eef2ff !important; font-weight: 700; }
        .btn { position: fixed; top: 18px; right: 18px; background: #1e3a5f; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
        .page { padding: 32px 44px; max-width: 860px; margin: 0 auto; }
        h1 { font-size: 22px; font-weight: 700; letter-spacing: 4px; text-align: center; margin-bottom: 4px; }
        .sub-title { text-align: center; font-size: 11px; color: #888; margin-bottom: 20px; }
        .info-table td:first-child { background: #f5f7fa; font-weight: 600; width: 100px; text-align: center; }
        .stamp-area { border: 2px solid #333; width: 70px; height: 70px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: #aaa; }
      `}</style>

      <button className="btn no-print" onClick={() => window.print()}>🖨 인쇄 / PDF</button>

      <div className="page">
        {/* 헤더 */}
        <h1>{typeLabel === '인증비' ? 'CERTIFICATION INVOICE' : 'A/S SERVICE INVOICE'}</h1>
        <div className="sub-title">{typeLabel} 청구서</div>

        {/* 기본 정보 */}
        <table className="info-table" style={{ marginBottom: 16 }}>
          <tbody>
            <tr>
              <td>문서번호</td><td>{record.businessId}</td>
              <td style={{ background: '#f5f7fa', fontWeight: 600, textAlign: 'center', width: 100 }}>발행일</td><td>{issuedDate}</td>
            </tr>
            <tr>
              <td>제목 / 내용</td><td colSpan={3}>{record.description || typeLabel}</td>
            </tr>
            <tr>
              <td>청구 대상</td><td>{record.clientName || '-'}</td>
              <td style={{ background: '#f5f7fa', fontWeight: 600, textAlign: 'center' }}>발생일</td><td>{record.incurredDate || '-'}</td>
            </tr>
            <tr>
              <td>통관 연결</td><td>{record.importBusinessId || '-'}</td>
              <td style={{ background: '#f5f7fa', fontWeight: 600, textAlign: 'center' }}>선적 연결</td><td>{record.shipmentBusinessId || '-'}</td>
            </tr>
          </tbody>
        </table>

        {/* 비용 내역 */}
        <table style={{ marginBottom: 4 }}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>No.</th>
              <th>내역 (Description)</th>
              <th style={{ width: 60 }}>수량</th>
              <th style={{ width: 50 }}>단위</th>
              <th style={{ width: 110 }}>단가 (원)</th>
              <th style={{ width: 50 }}>VAT</th>
              <th style={{ width: 120 }}>금액 (원)</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? items.map((item, i) => (
              <tr key={i}>
                <td className="center">{i + 1}</td>
                <td>{item.description}</td>
                <td className="num">{(item.qty || 1).toLocaleString()}</td>
                <td className="center">{item.unit || 'EA'}</td>
                <td className="num">{(item.unitPrice || 0).toLocaleString()}</td>
                <td className="center">{item.vatIncluded ? '✓' : '-'}</td>
                <td className="num" style={{ fontWeight: 600 }}>{(item.amount || 0).toLocaleString()}</td>
                <td style={{ fontSize: 11, color: '#666' }}>{item.note || ''}</td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="center" style={{ color: '#aaa' }}>내역 없음</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f9f9f9' }}>
              <td colSpan={6} className="num" style={{ fontSize: 11, color: '#666' }}>소 계 (Subtotal)</td>
              <td className="num" style={{ fontWeight: 600 }}>{subtotal.toLocaleString()}</td>
              <td></td>
            </tr>
            {vatTotal > 0 && (
              <tr>
                <td colSpan={6} className="num" style={{ fontSize: 11, color: '#666' }}>부가세 (VAT 10%)</td>
                <td className="num">{Math.round(vatTotal).toLocaleString()}</td>
                <td></td>
              </tr>
            )}
            <tr className="total-row">
              <td colSpan={6} className="num" style={{ fontSize: 13 }}>합 계 (Total)</td>
              <td className="num" style={{ fontSize: 14 }}>₩ {grandTotal.toLocaleString()}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        {/* 비고 */}
        {record.remark && (
          <div style={{ border: '1px solid #ddd', borderRadius: 4, padding: '8px 12px', fontSize: 11, color: '#555', marginBottom: 24, marginTop: 8 }}>
            <strong>비고:</strong> {record.remark}
          </div>
        )}

        {/* 서명란 */}
        <table style={{ marginTop: 28 }}>
          <tbody>
            <tr>
              <th style={{ width: '20%', textAlign: 'center' }}>작성자</th>
              <td style={{ width: '30%', height: 60, textAlign: 'center' }}>
                <div className="stamp-area">서명</div>
              </td>
              <th style={{ width: '20%', textAlign: 'center' }}>수신 확인</th>
              <td style={{ width: '30%', height: 60, textAlign: 'center' }}>
                <div className="stamp-area">서명</div>
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>승인자</th>
              <td style={{ height: 60, textAlign: 'center' }}>
                <div className="stamp-area">서명</div>
              </td>
              <th style={{ textAlign: 'center' }}>결재일</th>
              <td style={{ height: 60 }}></td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 28, textAlign: 'center', fontSize: 10, color: '#aaa' }}>
          본 문서는 {typeLabel} 관련 청구서로 전자 발행되었습니다. · {issuedDate} 발행
        </div>
      </div>
    </div>
  );
}

export default function CertPrintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>로딩 중...</div>}>
      <CertPrintContent />
    </Suspense>
  );
}
