'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { CostRecord, CostLineItem } from '@/app/api/cost-records/route';

const TYPE_TITLES: Record<string, { ko: string; en: string }> = {
  certification: { ko: '인증비 청구서', en: 'CERTIFICATION INVOICE' },
  as_service:    { ko: 'A/S 현장 비용 청구서', en: 'FIELD SERVICE INVOICE' },
  labor:         { ko: '인건비 청구서', en: 'LABOR COST INVOICE' },
  other:         { ko: '비용 청구서', en: 'COST INVOICE' },
};

interface CompanySettings {
  name: string; ceo: string; bizNo: string; bizType: string; bizItem: string;
  address: string; tel: string; fax: string; email: string;
  bank: string; bankForeign1: string; bankForeign2: string;
  logoUrl: string; stampUrl: string;
}

function fmt(n: number, cur: string) {
  if (cur === 'KRW') return n.toLocaleString('ko-KR');
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CertPrintContent() {
  const params = useSearchParams();
  const id = params.get('id');
  const [record, setRecord] = useState<CostRecord | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [writer, setWriter] = useState<{ name: string; department?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/cost-records/${id}`).then(r => r.json()),
      fetch('/api/settings/company').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ]).then(([rec, co, me]) => {
      if (rec.data) setRecord(rec.data);
      if (co.data) setCompany(co.data);
      if (me.user) setWriter(me.user);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>로딩 중...</div>;
  if (!record) return <div style={{ padding: 40, textAlign: 'center' }}>항목을 찾을 수 없습니다.</div>;

  const items: CostLineItem[] = record.lineItems || [];
  const cur = record.billCurrency || record.costCurrency || 'KRW';
  const isForeign = cur !== 'KRW';
  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const vatAmount = items.reduce((s, i) => {
    if (!i.vatIncluded) return s;
    return s + Math.round((i.amount / 1.1) * 0.1 * 100) / 100;
  }, 0);
  const grandTotal = subtotal;

  const title = TYPE_TITLES[record.costType] || TYPE_TITLES.other;
  const issuedDate = new Date().toLocaleDateString('ko-KR');
  const bankInfo = isForeign ? (company?.bankForeign1 || company?.bank || '') : (company?.bank || '');

  const sym = { KRW: '₩', USD: '$', CNY: '¥', EUR: '€', JPY: '¥' }[cur] || cur;

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 15mm 15mm 15mm 15mm; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', Arial, sans-serif; color: #1a1a1a; background: white; }
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
              <img src={company.logoUrl} alt="logo" style={{ height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            )}
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>{title.en}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{title.ko}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{record.businessId}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>발행일: {issuedDate}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>통화: {cur}</div>
          </div>
        </div>

        <div style={{ padding: '20px 36px', display: 'flex', gap: 20 }}>
          {/* 발행 회사 */}
          <div style={{ flex: 1, border: '1px solid #dde3ed', borderRadius: 6, padding: '12px 16px' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#888', marginBottom: 8, fontWeight: 700 }}>발행자 (From)</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{company?.name || ''}</div>
            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.7 }}>
              {company?.address && <div>{company.address}</div>}
              {company?.tel && <div>TEL: {company.tel}{company.fax ? `  FAX: ${company.fax}` : ''}</div>}
              {company?.email && <div>E: {company.email}</div>}
              {company?.bizNo && <div>사업자번호: {company.bizNo}</div>}
            </div>
          </div>

          {/* 청구 대상 */}
          <div style={{ flex: 1, border: '1px solid #dde3ed', borderRadius: 6, padding: '12px 16px' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#888', marginBottom: 8, fontWeight: 700 }}>청구 대상 (Bill To)</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{record.clientName || '—'}</div>
            {record.importBusinessId && <div style={{ fontSize: 11, color: '#555' }}>통관: {record.importBusinessId}</div>}
            {record.shipmentBusinessId && <div style={{ fontSize: 11, color: '#555' }}>선적: {record.shipmentBusinessId}</div>}
          </div>

          {/* 청구 요약 */}
          <div style={{ minWidth: 180, border: '2px solid #1e3a5f', borderRadius: 6, padding: '12px 16px', background: '#f7f9fc' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#1e3a5f', marginBottom: 8, fontWeight: 700 }}>청구 금액</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1e3a5f' }}>{sym} {fmt(grandTotal, cur)}</div>
            {vatAmount > 0 && <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>VAT: {sym} {fmt(vatAmount, cur)}</div>}
            {record.incurredDate && <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>발생일: {record.incurredDate}</div>}
          </div>
        </div>

        {/* ── 제목 ── */}
        <div style={{ padding: '0 36px', marginBottom: 12 }}>
          {record.description && (
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e3a5f', borderLeft: '3px solid #1e3a5f', paddingLeft: 10 }}>
              {record.description}
            </div>
          )}
        </div>

        {/* ── 내역 테이블 ── */}
        <div style={{ padding: '0 36px', marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th className="center" style={{ width: 34 }}>No.</th>
                <th>내역 (Description)</th>
                <th className="num" style={{ width: 55 }}>수량</th>
                <th className="center" style={{ width: 48 }}>단위</th>
                <th className="num" style={{ width: 110 }}>단가 ({cur})</th>
                <th className="center" style={{ width: 44 }}>VAT</th>
                <th className="num" style={{ width: 120 }}>금액 ({cur})</th>
                <th style={{ width: 90 }}>비고</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? items.map((item, i) => (
                <tr key={i}>
                  <td className="center">{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{item.description}</td>
                  <td className="num">{(item.qty || 1).toLocaleString()}</td>
                  <td className="center">{item.unit || '건'}</td>
                  <td className="num">{fmt(item.unitPrice || 0, cur)}</td>
                  <td className="center">{item.vatIncluded ? '✓' : '—'}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmt(item.amount || 0, cur)}</td>
                  <td style={{ fontSize: 10.5, color: '#666' }}>{item.note || ''}</td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="center" style={{ color: '#aaa', padding: 20 }}>내역 없음</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f5f7fa' }}>
                <td colSpan={6} className="num" style={{ fontWeight: 600, color: '#555' }}>소 계 (Subtotal)</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(subtotal, cur)}</td>
                <td></td>
              </tr>
              {vatAmount > 0 && (
                <tr style={{ background: '#fefaf5' }}>
                  <td colSpan={6} className="num" style={{ color: '#666' }}>부가세 (VAT 10%)</td>
                  <td className="num">{fmt(Math.round(vatAmount), cur)}</td>
                  <td></td>
                </tr>
              )}
              <tr className="total-row">
                <td colSpan={6} className="num" style={{ fontSize: 13 }}>합 계 (Total)</td>
                <td className="num" style={{ fontSize: 14 }}>{sym} {fmt(grandTotal, cur)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── 비고 + 계좌 ── */}
        <div style={{ padding: '0 36px', display: 'flex', gap: 16, marginBottom: 20 }}>
          {record.remark && (
            <div style={{ flex: 1, border: '1px solid #e0e6ef', borderRadius: 5, padding: '10px 14px', fontSize: 11.5, color: '#555' }}>
              <strong>비고:</strong> {record.remark}
            </div>
          )}
          {bankInfo && (
            <div style={{ minWidth: 260, border: '1px solid #c8d8f0', borderRadius: 5, padding: '10px 14px', background: '#f5f9ff' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#1e3a5f', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                {isForeign ? 'Bank Account (Foreign)' : '입금 계좌 정보'}
              </div>
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: '#333', fontFamily: 'inherit', lineHeight: 1.6 }}>{bankInfo}</pre>
            </div>
          )}
        </div>

        {/* ── 결재란 (compact) ── */}
        <div style={{ padding: '0 36px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, width: 'fit-content' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', marginRight: 12, paddingTop: 8 }}>결재:</div>
            {/* 작성자 */}
            <div style={{ border: '1px solid #aaa', textAlign: 'center', width: 76, padding: '6px 4px' }}>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>작성자</div>
              <div style={{ fontSize: 11, fontWeight: 600, minHeight: 24, paddingTop: 4 }}>{writer?.name || ''}</div>
              {writer?.department && <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>{writer.department}</div>}
            </div>
            {/* 검토자 */}
            <div style={{ border: '1px solid #aaa', borderLeft: 'none', textAlign: 'center', width: 76, padding: '6px 4px' }}>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>검토자</div>
              <div style={{ minHeight: 24 }}></div>
            </div>
            {/* 승인자 */}
            <div style={{ border: '1px solid #aaa', borderLeft: 'none', textAlign: 'center', width: 76, padding: '6px 4px' }}>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>승인자</div>
              <div style={{ minHeight: 24 }}></div>
              <div style={{ fontSize: 8, color: '#bbb', marginTop: 2 }}>전자결재</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 36px 0', fontSize: 10, color: '#bbb', textAlign: 'right' }}>
          본 문서는 전자 발행된 청구서입니다 · {company?.name || ''} · {issuedDate}
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
