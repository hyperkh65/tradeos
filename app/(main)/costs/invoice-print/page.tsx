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
  const [writer, setWriter] = useState<{ name: string; department?: string } | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
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
  const clientDisplayName = client?.nameEn || client?.name || inv.clientName || '—';

  const statusColor = inv.status === 'paid' ? '#16a34a' : inv.status === 'sent' ? '#d97706' : '#555';
  const statusLabel = inv.status === 'paid' ? 'PAID' : inv.status === 'sent' ? 'SENT' : inv.status === 'draft' ? 'DRAFT' : inv.status.toUpperCase();

  return (
    <div>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          @page { margin: 12mm 15mm 15mm 15mm; size: A4; }
        }
        * { box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; color: #1a1a1a; background: #fff; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 7px 10px; font-size: 12px; vertical-align: middle; }
        th { background: #f5f7fa; font-weight: 600; text-align: left; }
        .header-row { background: #1e3a5f; color: white; padding: 20px 30px; display: flex; align-items: center; justify-content: space-between; }
        .content { padding: 20px 30px; }
        .title { font-size: 24px; font-weight: 800; letter-spacing: 2px; }
        .subtitle { font-size: 12px; margin-top: 2px; opacity: 0.75; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .info-box { border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px 16px; }
        .info-box h4 { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; margin: 0 0 10px; font-weight: 700; }
        .info-name { font-size: 14px; font-weight: 700; margin-bottom: 5px; }
        .info-detail { font-size: 11.5px; color: #444; line-height: 1.65; }
        .section-title { font-size: 13px; font-weight: 700; margin: 18px 0 8px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px; color: #1e3a5f; }
        .total-row td { background: #eef2ff !important; font-weight: 700; }
        .subtotal-row td { background: #f8fafc; }
        .bank-box { border: 1px solid #c8d8f0; border-radius: 6px; padding: 12px 16px; background: #f0f6ff; margin-top: 16px; }
        .bank-box h4 { font-size: 9px; text-transform: uppercase; color: #1e3a5f; margin: 0 0 8px; font-weight: 700; letter-spacing: 1px; }
        .approval-row { display: flex; border: 1px solid #ccc; }
        .approval-cell { text-align: center; width: 76px; padding: 6px 4px; font-size: 9px; color: #888; border-right: 1px solid #ccc; }
        .approval-cell:last-child { border-right: none; }
        .approval-name { font-size: 11px; font-weight: 600; min-height: 22px; padding-top: 4px; color: #1a1a1a; }
        .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
        .print-btn { position: fixed; top: 20px; right: 20px; background: #1e3a5f; color: white; border: none; padding: 10px 22px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.18); }
        .print-btn:hover { background: #2a4f82; }
        .remark-box { border: 1px solid #e8e8e8; border-radius: 5px; padding: 10px 14px; font-size: 12px; color: #555; margin-top: 16px; }
        .footer-text { font-size: 10px; color: #bbb; text-align: right; margin-top: 16px; }
      `}</style>

      <button className="print-btn no-print" onClick={() => window.print()}>🖨 PDF 인쇄</button>

      {/* ── 헤더 ── */}
      <div className="header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {company?.logoUrl && (
            <div style={{ background: 'white', borderRadius: 5, padding: '3px 8px', display: 'flex', alignItems: 'center' }}>
              <img src={company.logoUrl} alt="logo" style={{ height: 30, objectFit: 'contain', display: 'block' }} />
            </div>
          )}
          <div>
            <div className="title">INVOICE</div>
            <div className="subtitle">외화 청구서</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{inv.businessId}</div>
          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 3 }}>Date: {issuedDate}</div>
          {inv.dueDate && <div style={{ opacity: 0.75, fontSize: 11 }}>Due: {inv.dueDate}</div>}
          <div style={{ opacity: 0.75, fontSize: 11 }}>Currency: {cur}</div>
          <div style={{ marginTop: 5 }}>
            <span className="status-badge" style={{ background: inv.status === 'paid' ? '#dcfce7' : '#fef3c7', color: statusColor }}>
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="content">
        {/* ── From / Bill To ── */}
        <div className="info-grid">
          <div className="info-box">
            <h4>From (발행자)</h4>
            <div className="info-name">{company?.name || ''}</div>
            <div className="info-detail">
              {company?.address && <div>{company.address}</div>}
              {company?.tel && <div>TEL: {company.tel}{company.fax ? `  FAX: ${company.fax}` : ''}</div>}
              {company?.email && <div>E: {company.email}</div>}
              {company?.bizNo && <div>Business No: {company.bizNo}</div>}
            </div>
          </div>
          <div className="info-box" style={{ borderLeft: '3px solid #1e3a5f' }}>
            <h4>Bill To (청구 대상)</h4>
            <div className="info-name">{clientDisplayName}</div>
            {client?.nameEn && client?.name && client.name !== client.nameEn && (
              <div style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>{client.name}</div>
            )}
            <div className="info-detail">
              {client?.address && <div>{client.address}</div>}
              {client?.country && <div>{client.country}</div>}
              {client?.phone && <div>TEL: {client.phone}</div>}
              {client?.email && <div>E: {client.email}</div>}
              {client?.contactPerson && <div>Attn: <strong>{client.contactPerson}</strong></div>}
              {!client && <div style={{ color: '#999' }}>{inv.clientName}</div>}
            </div>
          </div>
        </div>

        {/* ── 금액 요약 바 ── */}
        <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 6, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: '#3730a3', fontWeight: 600 }}>Total Amount Due</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1e3a5f' }}>{sym} {fmt(inv.total, cur)}</div>
        </div>

        {/* ── 내역 테이블 ── */}
        <div className="section-title">청구 내역 (Item Details)</div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32, textAlign: 'center' }}>No.</th>
              <th>Description (항목)</th>
              <th style={{ width: 52, textAlign: 'right' }}>Qty</th>
              <th style={{ width: 48, textAlign: 'center' }}>Unit</th>
              <th style={{ width: 115, textAlign: 'right' }}>Unit Price ({cur})</th>
              <th style={{ width: 42, textAlign: 'center' }}>VAT</th>
              <th style={{ width: 120, textAlign: 'right' }}>Amount ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.length > 0 ? inv.items.map((item, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{item.description}</td>
                <td style={{ textAlign: 'right' }}>{(item.qty ?? 1).toLocaleString()}</td>
                <td style={{ textAlign: 'center' }}>{item.unit || 'lot'}</td>
                <td style={{ textAlign: 'right' }}>{fmt(item.unitPrice ?? item.amount, cur)}</td>
                <td style={{ textAlign: 'center' }}>{item.vatIncluded ? '✓' : '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(item.amount, cur)}</td>
              </tr>
            )) : (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#aaa', padding: 18 }}>No items</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="subtotal-row">
              <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600, color: '#555' }}>Subtotal</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(inv.subtotal, cur)}</td>
            </tr>
            {(inv.vatAmount ?? 0) > 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'right', color: '#666' }}>VAT (10%)</td>
                <td style={{ textAlign: 'right' }}>{fmt(inv.vatAmount, cur)}</td>
              </tr>
            )}
            <tr className="total-row">
              <td colSpan={5} style={{ border: 'none', background: 'transparent' }} />
              <td style={{ textAlign: 'right', fontSize: 13 }}>TOTAL ({cur})</td>
              <td style={{ textAlign: 'right', fontSize: 14 }}>{sym} {fmt(inv.total, cur)}</td>
            </tr>
          </tfoot>
        </table>

        {/* ── 수금 정보 ── */}
        {inv.status === 'paid' && inv.fxRateAtPayment && (
          <div style={{ border: '1px solid #bbf7d0', borderRadius: 5, padding: '8px 14px', background: '#f0fdf4', fontSize: 11.5, color: '#166534', marginTop: 12 }}>
            <strong>수금 완료</strong> · 환율: {inv.fxRateAtPayment.toLocaleString()}
            {inv.paidAmountKrw && ` · ₩${inv.paidAmountKrw.toLocaleString()}`}
            {inv.paidAt && ` · 수금일: ${inv.paidAt}`}
          </div>
        )}

        {/* ── 계좌 정보 ── */}
        {bankInfo && (
          <div className="bank-box">
            <h4>{isForeign ? 'Remittance Account (송금 계좌)' : '입금 계좌 정보'}</h4>
            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#222', fontFamily: 'inherit', lineHeight: 1.65, margin: 0 }}>{bankInfo}</pre>
          </div>
        )}

        {/* ── 비고 ── */}
        {inv.remark && (
          <div className="remark-box">
            <strong style={{ color: '#333' }}>Remarks:</strong> {inv.remark}
          </div>
        )}

        {/* ── 결재란 + 직인 ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', marginRight: 10, paddingTop: 8 }}>결재:</div>
            <div>
              <div className="approval-row">
                <div className="approval-cell">
                  <div>작성자</div>
                  <div className="approval-name">{writer?.name || ''}</div>
                  {writer?.department && <div style={{ fontSize: 8, color: '#aaa', marginTop: 1 }}>{writer.department}</div>}
                </div>
                <div className="approval-cell">
                  <div>검토자</div>
                  <div style={{ minHeight: 22 }}></div>
                </div>
                <div className="approval-cell" style={{ borderRight: 'none' }}>
                  <div>승인자</div>
                  <div style={{ minHeight: 22 }}></div>
                  <div style={{ fontSize: 8, color: '#ccc', marginTop: 1 }}>전자결재</div>
                </div>
              </div>
            </div>
          </div>
          {company?.stampUrl && (
            <img src={company.stampUrl} alt="stamp" style={{ height: 70, objectFit: 'contain', opacity: 0.85 }} />
          )}
        </div>

        <div className="footer-text">
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
