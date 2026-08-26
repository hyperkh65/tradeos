import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { getCompanySettings } from '@/lib/pdf/company';

interface RfqItem {
  name: string; specification?: string; qty: number; unit?: string; remark?: string;
  unitPrice?: number; images?: { url: string }[];
}
interface SampleItem {
  name: string; specification?: string; qty: number; unit?: string; remark?: string;
  chargeType?: 'free' | 'paid'; amount?: number; images?: { url: string }[];
}

function esc(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtPrice(n: number | undefined, currency: string) {
  if (!n) return '';
  return n.toLocaleString(currency === 'KRW' ? 'ko-KR' : 'en-US', { minimumFractionDigits: currency === 'KRW' ? 0 : 2, maximumFractionDigits: currency === 'KRW' ? 0 : 2 });
}

function buildRfqWordHtml(row: Record<string, unknown>, origin: string): string {
  const data = JSON.parse((row.data_json as string) || '{}') as {
    date?: string; validUntil?: string; currency?: string; paymentTerms?: string;
    supplierName: string; supplierContact?: string; supplierEmail?: string; supplierPhone?: string; supplierAddress?: string;
    items: RfqItem[]; remark?: string;
  };
  const currency = data.currency || 'USD';
  const company = getCompanySettings();
  const items = data.items || [];
  const totalAmount = items.reduce((s, it) => s + (it.qty || 0) * (it.unitPrice || 0), 0);
  const absUrl = (u: string) => u.startsWith('http') ? u : `${origin}${u}`;

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 11pt; color: #171717; }
  table { border-collapse: collapse; }
  .item-table { width: 100%; margin-top: 14px; }
  .item-table th, .item-table td { border: 1px solid #999; padding: 6px 8px; font-size: 10pt; }
  .item-table th { background: #f0f0f0; }
  .box { border: 1px solid #ccc; padding: 10px; vertical-align: top; }
  .box-from { background: #eef4fc; }
  .title { font-size: 20pt; font-weight: bold; color: #1a50a0; }
  .sub { color: #888; font-size: 9pt; }
</style>
</head>
<body>
  <table style="width:100%; margin-bottom: 16px;"><tr>
    <td style="width:55%; vertical-align: top;">
      <div style="font-size:14pt; font-weight:bold;">${esc(company.name)}</div>
      <div style="font-size:9pt; color:#555;">${esc(company.address)}</div>
      <div style="font-size:9pt; color:#555;">Tel: ${esc(company.tel)}${company.fax ? ` | Fax: ${esc(company.fax)}` : ''}</div>
      <div style="font-size:9pt; color:#555;">Email: ${esc(company.email)}</div>
      <div style="font-size:9pt; color:#555;">사업자번호: ${esc(company.bizNo)}</div>
    </td>
    <td style="width:45%; text-align:right; vertical-align: top;">
      <div class="title">견적 의뢰서</div>
      <div class="sub">REQUEST FOR QUOTATION</div>
      <div style="margin-top:8px; font-size:10pt;">Quote No. <b>${esc(row.business_id as string)}</b></div>
      <div style="font-size:10pt;">Date ${esc(data.date || (row.created_at as string)?.slice(0, 10))}</div>
      ${data.validUntil ? `<div style="font-size:10pt;">Valid Until ${esc(data.validUntil)}</div>` : ''}
      <div style="font-size:10pt;">Currency <b>${esc(currency)}</b></div>
    </td>
  </tr></table>

  <table style="width:100%; margin-bottom: 16px;"><tr>
    <td class="box box-from" style="width:50%;">
      <div style="font-size:9pt; font-weight:bold; color:#1a50a0; margin-bottom:6px;">FROM (구매자)</div>
      <div style="font-weight:bold; margin-bottom:4px;">${esc(company.name)}</div>
      <div style="font-size:9pt;">${esc(company.address)}</div>
      <div style="font-size:9pt;">Tel: ${esc(company.tel)}${company.fax ? ` | Fax: ${esc(company.fax)}` : ''}</div>
      <div style="font-size:9pt;">Email: ${esc(company.email)}</div>
      <div style="font-size:9pt;">사업자번호: ${esc(company.bizNo)}</div>
    </td>
    <td class="box" style="width:50%;">
      <div style="font-size:9pt; font-weight:bold; color:#666; margin-bottom:6px;">TO (공급사)</div>
      <div style="font-weight:bold; margin-bottom:4px;">${esc(data.supplierName) || '-'}</div>
      ${data.supplierContact ? `<div style="font-size:9pt;">담당자: ${esc(data.supplierContact)}</div>` : ''}
      ${data.supplierPhone ? `<div style="font-size:9pt;">Tel: ${esc(data.supplierPhone)}</div>` : ''}
      ${data.supplierEmail ? `<div style="font-size:9pt;">Email: ${esc(data.supplierEmail)}</div>` : ''}
      ${data.supplierAddress ? `<div style="font-size:9pt;">${esc(data.supplierAddress)}</div>` : ''}
    </td>
  </tr></table>

  ${data.paymentTerms ? `<div style="background:#fafafa; border:1px solid #eee; padding:8px 12px; margin-bottom:16px;">
    <span style="font-size:9pt; font-weight:bold; color:#888;">지급조건 / PAYMENT TERMS</span>
    <span style="font-size:10pt;"> ${esc(data.paymentTerms)}</span>
  </div>` : ''}

  <table class="item-table">
    <tr>
      <th style="width:5%;">NO</th><th style="width:12%;">사진</th><th>품목</th><th style="width:16%;">규격</th>
      <th style="width:8%;">단위</th><th style="width:8%;">수량</th><th style="width:12%;">단가(${esc(currency)})</th>
      <th style="width:12%;">금액(${esc(currency)})</th><th style="width:16%;">비고</th>
    </tr>
    ${items.map((it, i) => {
      const amount = (it.qty || 0) * (it.unitPrice || 0);
      const imgUrl = it.images?.[0]?.url;
      return `<tr>
      <td style="text-align:center;">${i + 1}</td>
      <td style="text-align:center;">${imgUrl ? `<img src="${esc(absUrl(imgUrl))}" style="width:40px; height:40px; object-fit:cover;" />` : '-'}</td>
      <td>${esc(it.name)}</td>
      <td>${esc(it.specification)}</td>
      <td style="text-align:center;">${esc(it.unit || 'EA')}</td>
      <td style="text-align:right;">${esc((it.qty || 0).toLocaleString())}</td>
      <td style="text-align:right;">${esc(fmtPrice(it.unitPrice, currency))}</td>
      <td style="text-align:right;">${esc(amount ? fmtPrice(amount, currency) : '')}</td>
      <td>${esc(it.remark)}</td>
    </tr>`;
    }).join('')}
    ${totalAmount > 0 ? `<tr>
      <td colspan="7" style="text-align:right; font-weight:bold; background:#f5f5f5;">합계 (${esc(currency)})</td>
      <td style="text-align:right; font-weight:bold; background:#f5f5f5;">${esc(fmtPrice(totalAmount, currency))}</td>
      <td style="background:#f5f5f5;"></td>
    </tr>` : ''}
  </table>

  ${data.remark ? `<div style="margin-top:16px;">
    <div style="font-size:9pt; font-weight:bold; color:#888; margin-bottom:6px;">요청사항</div>
    <div style="font-size:10pt; white-space: pre-wrap;">${esc(data.remark)}</div>
  </div>` : ''}

  <p style="margin-top:20px; font-size:9pt; color:#aaa; text-align:center;">상기 품목에 대한 견적을 요청드립니다. 회신은 위 연락처로 부탁드립니다.</p>
</body>
</html>`;
}

function buildSampleRequestWordHtml(row: Record<string, unknown>, origin: string): string {
  const data = JSON.parse((row.data_json as string) || '{}') as {
    date?: string; validUntil?: string; currency?: string;
    supplierName: string; supplierContact?: string; supplierEmail?: string; supplierPhone?: string; supplierAddress?: string;
    items: SampleItem[]; remark?: string;
  };
  const currency = data.currency || 'USD';
  const company = getCompanySettings();
  const items = data.items || [];
  const totalAmount = items.reduce((s, it) => s + (it.chargeType === 'paid' ? (it.amount || 0) : 0), 0);
  const absUrl = (u: string) => u.startsWith('http') ? u : `${origin}${u}`;

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 11pt; color: #171717; }
  table { border-collapse: collapse; }
  .item-table { width: 100%; margin-top: 14px; }
  .item-table th, .item-table td { border: 1px solid #999; padding: 6px 8px; font-size: 10pt; }
  .item-table th { background: #f0f0f0; }
  .box { border: 1px solid #ccc; padding: 10px; vertical-align: top; }
  .box-from { background: #eefaf3; }
  .title { font-size: 20pt; font-weight: bold; color: #0f8a5f; }
  .sub { color: #888; font-size: 9pt; }
</style>
</head>
<body>
  <table style="width:100%; margin-bottom: 16px;"><tr>
    <td style="width:55%; vertical-align: top;">
      <div style="font-size:14pt; font-weight:bold;">${esc(company.name)}</div>
      <div style="font-size:9pt; color:#555;">${esc(company.address)}</div>
      <div style="font-size:9pt; color:#555;">Tel: ${esc(company.tel)}${company.fax ? ` | Fax: ${esc(company.fax)}` : ''}</div>
      <div style="font-size:9pt; color:#555;">Email: ${esc(company.email)}</div>
      <div style="font-size:9pt; color:#555;">사업자번호 Biz No: ${esc(company.bizNo)}</div>
    </td>
    <td style="width:45%; text-align:right; vertical-align: top;">
      <div class="title">샘플 의뢰서</div>
      <div class="sub">SAMPLE REQUEST FORM</div>
      <div style="margin-top:8px; font-size:10pt;">문서번호 No. <b>${esc(row.business_id as string)}</b></div>
      <div style="font-size:10pt;">작성일 Date ${esc(data.date || (row.created_at as string)?.slice(0, 10))}</div>
      ${data.validUntil ? `<div style="font-size:10pt;">유효기한 Valid Until ${esc(data.validUntil)}</div>` : ''}
      <div style="font-size:10pt;">통화 Currency <b>${esc(currency)}</b></div>
    </td>
  </tr></table>

  <table style="width:100%; margin-bottom: 16px;"><tr>
    <td class="box box-from" style="width:50%;">
      <div style="font-size:9pt; font-weight:bold; color:#0f8a5f; margin-bottom:6px;">구매자 FROM (BUYER)</div>
      <div style="font-weight:bold; margin-bottom:4px;">${esc(company.name)}</div>
      <div style="font-size:9pt;">${esc(company.address)}</div>
      <div style="font-size:9pt;">Tel: ${esc(company.tel)}${company.fax ? ` | Fax: ${esc(company.fax)}` : ''}</div>
      <div style="font-size:9pt;">Email: ${esc(company.email)}</div>
      <div style="font-size:9pt;">사업자번호 Biz No: ${esc(company.bizNo)}</div>
    </td>
    <td class="box" style="width:50%;">
      <div style="font-size:9pt; font-weight:bold; color:#666; margin-bottom:6px;">공급사 TO (SUPPLIER)</div>
      <div style="font-weight:bold; margin-bottom:4px;">${esc(data.supplierName) || '-'}</div>
      ${data.supplierContact ? `<div style="font-size:9pt;">담당자 Attn: ${esc(data.supplierContact)}</div>` : ''}
      ${data.supplierPhone ? `<div style="font-size:9pt;">Tel: ${esc(data.supplierPhone)}</div>` : ''}
      ${data.supplierEmail ? `<div style="font-size:9pt;">Email: ${esc(data.supplierEmail)}</div>` : ''}
      ${data.supplierAddress ? `<div style="font-size:9pt;">${esc(data.supplierAddress)}</div>` : ''}
    </td>
  </tr></table>

  <table class="item-table">
    <tr>
      <th style="width:5%;">NO</th><th style="width:12%;">사진 Photo</th><th>품목 Item</th><th style="width:15%;">규격 Spec</th>
      <th style="width:8%;">단위 Unit</th><th style="width:8%;">수량 Qty</th><th style="width:10%;">구분 Type</th>
      <th style="width:12%;">금액 Amount(${esc(currency)})</th><th style="width:15%;">비고 Remark</th>
    </tr>
    ${items.map((it, i) => {
      const isPaid = it.chargeType === 'paid';
      const imgUrl = it.images?.[0]?.url;
      return `<tr>
      <td style="text-align:center;">${i + 1}</td>
      <td style="text-align:center;">${imgUrl ? `<img src="${esc(absUrl(imgUrl))}" style="width:40px; height:40px; object-fit:cover;" />` : '-'}</td>
      <td>${esc(it.name)}</td>
      <td>${esc(it.specification)}</td>
      <td style="text-align:center;">${esc(it.unit || 'EA')}</td>
      <td style="text-align:right;">${esc((it.qty || 0).toLocaleString())}</td>
      <td style="text-align:center; font-weight:bold; color:${isPaid ? '#a83232' : '#0f8a5f'};">${isPaid ? '유상 Paid' : '무상 Free'}</td>
      <td style="text-align:right;">${esc(isPaid ? fmtPrice(it.amount, currency) : '')}</td>
      <td>${esc(it.remark)}</td>
    </tr>`;
    }).join('')}
    ${totalAmount > 0 ? `<tr>
      <td colspan="7" style="text-align:right; font-weight:bold; background:#f5f5f5;">유상품목 합계 Paid Total (${esc(currency)})</td>
      <td style="text-align:right; font-weight:bold; background:#f5f5f5;">${esc(fmtPrice(totalAmount, currency))}</td>
      <td style="background:#f5f5f5;"></td>
    </tr>` : ''}
  </table>

  ${data.remark ? `<div style="margin-top:16px;">
    <div style="font-size:9pt; font-weight:bold; color:#888; margin-bottom:6px;">요청사항 Note</div>
    <div style="font-size:10pt; white-space: pre-wrap;">${esc(data.remark)}</div>
  </div>` : ''}

  <p style="margin-top:20px; font-size:9pt; color:#aaa; text-align:center;">상기 품목의 샘플을 요청드립니다. 회신은 위 연락처로 부탁드립니다. / We kindly request samples of the above items. Please reply to the contact above.</p>
</body>
</html>`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const row = getDb().prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });

  const html = row.doc_type === 'rfq' ? buildRfqWordHtml(row, req.nextUrl.origin)
    : row.doc_type === 'sample_request' ? buildSampleRequestWordHtml(row, req.nextUrl.origin)
      : null;
  if (!html) return NextResponse.json({ error: '지원하지 않는 문서 종류입니다' }, { status: 400 });
  const filename = `${row.business_id}_${row.title}.doc`;
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'application/msword; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
