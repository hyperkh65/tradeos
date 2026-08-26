import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { getCompanySettings } from '@/lib/pdf/company';

interface RfqItem { name: string; specification?: string; qty: number; unit?: string; remark?: string }

function esc(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildRfqWordHtml(row: Record<string, unknown>): string {
  const data = JSON.parse((row.data_json as string) || '{}') as {
    date?: string; validUntil?: string;
    supplierName: string; supplierContact?: string; supplierEmail?: string; supplierPhone?: string; supplierAddress?: string;
    items: RfqItem[]; remark?: string;
  };
  const company = getCompanySettings();
  const items = data.items || [];

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

  <table class="item-table">
    <tr><th style="width:6%;">NO</th><th>품목</th><th style="width:20%;">규격</th><th style="width:10%;">단위</th><th style="width:10%;">수량</th><th style="width:22%;">비고</th></tr>
    ${items.map((it, i) => `<tr>
      <td style="text-align:center;">${i + 1}</td>
      <td>${esc(it.name)}</td>
      <td>${esc(it.specification)}</td>
      <td style="text-align:center;">${esc(it.unit || 'EA')}</td>
      <td style="text-align:right;">${esc((it.qty || 0).toLocaleString())}</td>
      <td>${esc(it.remark)}</td>
    </tr>`).join('')}
  </table>

  ${data.remark ? `<div style="margin-top:16px;">
    <div style="font-size:9pt; font-weight:bold; color:#888; margin-bottom:6px;">요청사항</div>
    <div style="font-size:10pt; white-space: pre-wrap;">${esc(data.remark)}</div>
  </div>` : ''}

  <p style="margin-top:20px; font-size:9pt; color:#aaa; text-align:center;">상기 품목에 대한 견적을 요청드립니다. 회신은 위 연락처로 부탁드립니다.</p>
</body>
</html>`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { id } = await params;
  const row = getDb().prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });
  if (row.doc_type !== 'rfq') return NextResponse.json({ error: '지원하지 않는 문서 종류입니다' }, { status: 400 });

  const html = buildRfqWordHtml(row);
  const filename = `${row.business_id}_${row.title}.doc`;
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'application/msword; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
