import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getNotionClient, DB } from '@/lib/notion/client';

function fmt(n: number) { return Math.round(n).toLocaleString('ko-KR'); }

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!DB.profitAnalysis) {
    return NextResponse.json(
      { error: 'NOTION_DB_PROFIT_ANALYSIS 환경변수가 설정되지 않았습니다.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM profit_analyses WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const pa = {
    businessId: row.business_id as string,
    title: row.title as string,
    analysisDate: (row.analysis_date as string) || '',
    customerName: (row.customer_name as string) || '',
    supplierName: (row.supplier_name as string) || '',
    importBusinessId: (row.import_business_id as string) || '',
    saleAmount: (row.sale_amount as number) || 0,
    customsExRate: (row.customs_ex_rate as number) || 0,
    wireExRate: (row.wire_ex_rate as number) || 0,
    freightCost: (row.freight_cost as number) || 0,
    inlandFreight: (row.inland_freight as number) || 0,
    brokerFee: (row.broker_fee as number) || 0,
    duty: (row.duty as number) || 0,
    vatImport: (row.vat_import as number) || 0,
    wireFee: (row.wire_fee as number) || 0,
    advancePayment: (row.advance_payment as number) || 0,
    paymentAmount: (row.payment_amount as number) || 0,
    productItems: (() => { try { return JSON.parse((row.product_items_json as string) || '[]'); } catch { return []; } })() as { name: string; spec?: string; qty: number; unitPriceFx: number; totalKrwManual?: number }[],
    extraCosts: (() => { try { return JSON.parse((row.extra_costs_json as string) || '[]'); } catch { return []; } })() as { name: string; amount: number }[],
    status: (row.status as string) || 'draft',
  };

  const cex = pa.customsExRate || 1;
  const wex = pa.wireExRate || cex;

  let productTotal = 0;
  for (const p of pa.productItems) {
    if (p.totalKrwManual) {
      productTotal += p.totalKrwManual;
    } else {
      productTotal += Math.round((p.qty || 0) * (p.unitPriceFx || 0) * wex);
    }
  }

  const logisticTotal = (pa.freightCost || 0) + (pa.inlandFreight || 0) + (pa.brokerFee || 0) + (pa.duty || 0) + (pa.wireFee || 0) + (pa.extraCosts || []).reduce((s, c) => s + (c.amount || 0), 0);
  const totalCost = productTotal + logisticTotal;
  const profit = pa.saleAmount - totalCost;
  const profitRate = pa.saleAmount > 0 ? (profit / pa.saleAmount) * 100 : 0;
  const effectivePayment = pa.paymentAmount > 0 ? pa.paymentAmount : productTotal;
  const actualCalc = effectivePayment - pa.advancePayment;

  const notion = getNotionClient();

  // 제목 구성: "[PA-XXXX] 매출업체 / 제목"
  const pageTitle = `[${pa.businessId}] ${pa.customerName ? pa.customerName + ' / ' : ''}${pa.title}`;

  // Content blocks
  const blocks: Parameters<typeof notion.pages.create>[0]['children'] = [
    // 기본정보 표
    {
      type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: '📊 수익분석 정산서' } }] },
    },
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: `분석일: ${pa.analysisDate}  |  매출업체: ${pa.customerName || '-'}  |  공급사: ${pa.supplierName || '-'}  |  통관번호: ${pa.importBusinessId || '-'}` }, annotations: { color: 'gray' } },
        ],
      },
    },
    {
      type: 'divider',
      divider: {},
    },
    // 1. 매출금액
    {
      type: 'heading_3',
      heading_3: { rich_text: [{ type: 'text', text: { content: '1. 매출금액' } }] },
    },
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: `${fmt(pa.saleAmount)} 원` }, annotations: { bold: true, code: true } },
          { type: 'text', text: { content: '  (부가세 별도)' }, annotations: { color: 'gray' } },
        ],
      },
    },
    // 2. 비용 — 제품원가
    {
      type: 'heading_3',
      heading_3: { rich_text: [{ type: 'text', text: { content: `2-1. 제품공가${pa.supplierName ? '  ' + pa.supplierName : ''}` } }] },
    },
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: `①통관환율: ${fmt(cex)}원/CNY    ②송금환율: ${fmt(wex)}원/CNY` }, annotations: { color: 'orange', italic: true } },
        ],
      },
    },
    // 제품 목록 (bulleted list)
    ...pa.productItems.map(p => {
      const t1 = p.totalKrwManual ?? Math.round((p.qty || 0) * (p.unitPriceFx || 0) * cex);
      const rmb = p.totalKrwManual ? null : (p.qty || 0) * (p.unitPriceFx || 0);
      const text = `${p.name}${p.spec ? ' ' + p.spec : ''}  |  수량: ${(p.qty || 0).toLocaleString()}  |  ①원가: ${fmt(t1)}원${rmb != null ? '  |  ¥' + rmb.toFixed(2) : ''}`;
      return {
        type: 'bulleted_list_item' as const,
        bulleted_list_item: { rich_text: [{ type: 'text' as const, text: { content: text } }] },
      };
    }),
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: `제품원가 소계 (②기준): ` } },
          { type: 'text', text: { content: `${fmt(productTotal)} 원` }, annotations: { bold: true } },
        ],
      },
    },
    // 2-2. 물류비용
    {
      type: 'heading_3',
      heading_3: { rich_text: [{ type: 'text', text: { content: '2-2. 물류·통관 비용 (부가세 제외)' } }] },
    },
    ...[
      { label: '포워더운임', val: pa.freightCost },
      { label: '내륙운송료', val: pa.inlandFreight },
      { label: '통관수수료', val: pa.brokerFee },
      { label: '관세', val: pa.duty },
      { label: '해외송금수수료', val: pa.wireFee },
      ...(pa.extraCosts || []).filter(c => c.amount > 0).map(c => ({ label: c.name, val: c.amount })),
    ].filter(c => c.val > 0).map(({ label, val }) => ({
      type: 'bulleted_list_item' as const,
      bulleted_list_item: { rich_text: [{ type: 'text' as const, text: { content: `${label}: ${fmt(val)} 원` } }] },
    })),
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: `비용합계: ` } },
          { type: 'text', text: { content: `${fmt(logisticTotal)} 원` }, annotations: { bold: true } },
          { type: 'text', text: { content: pa.vatImport > 0 ? `  |  부가세(별도/불포함): ${fmt(pa.vatImport)}원` : '' }, annotations: { color: 'gray', italic: true } },
        ],
      },
    },
    { type: 'divider', divider: {} },
    // 3. 수익
    {
      type: 'heading_3',
      heading_3: { rich_text: [{ type: 'text', text: { content: '3. 수익 (부가세 별도)' } }] },
    },
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: `${fmt(profit)} 원` }, annotations: { bold: true, color: profit >= 0 ? 'blue' : 'red' } },
          { type: 'text', text: { content: `   수익률: ${profitRate.toFixed(2)}%` }, annotations: { bold: true, color: profit >= 0 ? 'blue' : 'red' } },
        ],
      },
    },
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: `매출 ${fmt(pa.saleAmount)} − 총비용 ${fmt(totalCost)}` }, annotations: { color: 'gray' } },
        ],
      },
    },
    { type: 'divider', divider: {} },
    // 4~6. 정산
    {
      type: 'heading_3',
      heading_3: { rich_text: [{ type: 'text', text: { content: '정산' } }] },
    },
    {
      type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `4. 선지급비용: ${pa.advancePayment > 0 ? fmt(pa.advancePayment) + ' 원' : '—'}` } }] },
    },
    {
      type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `5. 지급액: ${fmt(effectivePayment)} 원${pa.paymentAmount === 0 ? ' (제품원가② 기준)' : ''}` } }] },
    },
    {
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [
          { type: 'text', text: { content: `6. 실지급액: ` } },
          { type: 'text', text: { content: actualCalc !== 0 ? fmt(actualCalc) + ' 원' : '—' }, annotations: { bold: true, color: 'orange' } },
          { type: 'text', text: { content: '  (지급액 − 선지급비용)' }, annotations: { color: 'gray' } },
        ],
      },
    },
  ];

  const properties = {
    '이름': { title: [{ text: { content: pageTitle } }] },
    ...(pa.analysisDate ? { '날짜': { date: { start: pa.analysisDate } } } : {}),
    ...(pa.customerName ? { '매출업체': { rich_text: [{ text: { content: pa.customerName } }] } } : {}),
    ...(pa.supplierName ? { '공급사': { rich_text: [{ text: { content: pa.supplierName } }] } } : {}),
    '매출금액': { number: pa.saleAmount },
    '수익': { number: profit },
    '수익률': { number: Math.round(profitRate * 100) / 100 },
    '상태': { select: { name: pa.status === 'confirmed' ? '확정' : '작성중' } },
  };

  try {
    // 기존 페이지 찾기 (business_id 기준)
    const existing = await notion.databases.query({
      database_id: DB.profitAnalysis,
      filter: { property: '이름', title: { starts_with: `[${pa.businessId}]` } },
      page_size: 1,
    });

    let pageId: string;
    if (existing.results.length > 0) {
      // 기존 페이지 업데이트
      pageId = existing.results[0].id;
      await notion.pages.update({ page_id: pageId, properties });
      // 기존 내용 삭제 후 새 블록 추가
      const children = await notion.blocks.children.list({ block_id: pageId });
      await Promise.all(children.results.map(b => notion.blocks.delete({ block_id: b.id })));
      await notion.blocks.children.append({ block_id: pageId, children: blocks });
    } else {
      // 새 페이지 생성
      const page = await notion.pages.create({
        parent: { database_id: DB.profitAnalysis },
        properties,
        children: blocks,
      });
      pageId = page.id;
    }

    return NextResponse.json({ ok: true, pageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Notion 저장 실패: ${msg}` }, { status: 500 });
  }
}
