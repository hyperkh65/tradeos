'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CostRecord } from '@/app/api/cost-records/route';
import { triggerPrint, isTauri } from '@/lib/tauri-print';

const COST_TYPE_LABELS: Record<string, string> = {
  duty: '관세', vat: '수입부가세', customs_broker: '관세사비',
  inspection: '세관검사비', warehouse: '창고료(장치료)',
  demurrage: '체화료(DEM)', detention: '지체료(DET)',
  inland_freight: '내륙운송비', ocean_freight: '해상운임',
  air_freight: '항공운임', certification: '인증비', other: '기타',
};

function ExpensePrintContent() {
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>로딩 중...</div>;
  if (!record) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>비용 항목을 찾을 수 없습니다.</div>;

  const costTypeLabel = COST_TYPE_LABELS[record.costType] || record.costType;
  const costKrw = record.costAmountKrw || record.costAmount;
  const issuedDate = new Date().toLocaleDateString('ko-KR');

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; margin: 0; color: #1a1a1a; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #aaa; padding: 7px 10px; font-size: 12px; }
        th { background: #f0f4f8; font-weight: 600; text-align: center; }
        .print-btn { position: fixed; top: 20px; right: 20px; background: #1e3a5f; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
        .seal-box { border: 2px solid #333; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #555; }
      `}</style>

      {isTauri() && (
        <button className="print-btn no-print" style={{ right: 160 }} onClick={() => window.history.back()}>← 뒤로가기</button>
      )}
      <button className="print-btn no-print" onClick={() => triggerPrint()}>🖨 비용서 인쇄</button>

      <div style={{ padding: '40px 50px', maxWidth: 800, margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, marginBottom: 4 }}>거 래 명 세 표</div>
          <div style={{ fontSize: 11, color: '#888' }}>내부 비용서 (Internal Expense Statement)</div>
        </div>

        {/* 기본 정보 표 */}
        <table style={{ marginBottom: 20 }}>
          <tbody>
            <tr>
              <th style={{ width: '15%' }}>문서번호</th>
              <td style={{ width: '35%' }}>{record.businessId}</td>
              <th style={{ width: '15%' }}>발행일</th>
              <td style={{ width: '35%' }}>{issuedDate}</td>
            </tr>
            <tr>
              <th>비용 유형</th>
              <td>{costTypeLabel}</td>
              <th>발생일</th>
              <td>{record.incurredDate || '-'}</td>
            </tr>
            <tr>
              <th>연결 선적</th>
              <td>{record.shipmentBusinessId || '-'}</td>
              <th>연결 통관</th>
              <td>{record.importBusinessId || '-'}</td>
            </tr>
            <tr>
              <th>거래처</th>
              <td>{record.clientName || '-'}</td>
              <th>담당자</th>
              <td>{record.createdBy || '-'}</td>
            </tr>
          </tbody>
        </table>

        {/* 비용 내역 */}
        <table style={{ marginBottom: 20 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>No.</th>
              <th>내역 (Description)</th>
              <th style={{ width: 100, textAlign: 'right' }}>금액</th>
              <th style={{ width: 60 }}>통화</th>
              <th style={{ width: 120, textAlign: 'right' }}>원화 환산</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>1</td>
              <td>{record.description || costTypeLabel}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                {record.costAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td style={{ textAlign: 'center' }}>{record.costCurrency}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                {Math.round(costKrw).toLocaleString()}원
              </td>
            </tr>
            {record.costCurrency !== 'KRW' && record.fxRateAtCost && (
              <tr>
                <td colSpan={5} style={{ fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                  ※ 적용 환율: {record.costCurrency}/KRW = {record.fxRateAtCost.toLocaleString()} (발생일 기준)
                </td>
              </tr>
            )}
            <tr style={{ background: '#f5f5f5', fontWeight: 700 }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합 계</td>
              <td style={{ textAlign: 'right', fontSize: 13 }}>
                {Math.round(costKrw).toLocaleString()}원
              </td>
            </tr>
          </tbody>
        </table>

        {/* 비고 */}
        {record.remark && (
          <div style={{ border: '1px solid #ddd', borderRadius: 4, padding: '10px 14px', fontSize: 12, color: '#555', marginBottom: 24 }}>
            <strong>비고:</strong> {record.remark}
          </div>
        )}

        {/* 서명란 */}
        <table style={{ width: '100%', marginTop: 32 }}>
          <tbody>
            <tr>
              <th style={{ width: '25%' }}>작성자</th>
              <td style={{ width: '25%', height: 60 }}></td>
              <th style={{ width: '25%' }}>확인자</th>
              <td style={{ width: '25%', height: 60 }}></td>
            </tr>
            <tr>
              <th>승인자</th>
              <td style={{ height: 60 }}></td>
              <th>결재 일자</th>
              <td style={{ height: 60 }}></td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 10, color: '#aaa' }}>
          이 문서는 내부 비용 처리를 위한 전자 거래명세표입니다.
        </div>
      </div>
    </div>
  );
}

export default function ExpensePrintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>로딩 중...</div>}>
      <ExpensePrintContent />
    </Suspense>
  );
}
