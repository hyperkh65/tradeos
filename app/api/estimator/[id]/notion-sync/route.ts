import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getNotionClient, DB } from '@/lib/notion/client';

interface ItemCert { id: string; name: string; totalCostKrw: number; shipQty: number; }
interface EstimatorItem {
  id: string; name: string; currency: string; sellingCurrency?: string;
  fobPrice: number; boxL: number; boxW: number; boxH: number; qtyPerBox: number;
  weightG?: number; certs?: ItemCert[]; dutyRateOverride?: number;
  sellingPrice?: number; targetMargin?: number; note?: string;
}

const CONTAINER_CBM: Record<string, number> = { '20ft': 27, '40ft': 56, '40HQ': 68 };

function rt(content: string) {
  return [{ type: 'text' as const, text: { content: String(content || '').slice(0, 2000) } }];
}

function calcDdpKrw(item: EstimatorItem, c: {
  fxUsd: number; fxRmb: number; dutyRate: number; eprRate: number;
  freightSea: number; freightSeaUsd?: number; freightInland: number; freightPort: number; freightMisc: number;
  containerType: string; simMode: string;
  eprObligationRate?: number;
}) {
  const fxUsd = c.fxUsd || 1430;
  const fxRmb = c.fxRmb || 195;
  const containerCbm = CONTAINER_CBM[c.containerType] || 56;
  const fobUsd = item.currency === 'CNY' ? item.fobPrice * (fxRmb / fxUsd) : item.fobPrice;
  const cbmPerBox = item.boxL > 0 && item.boxW > 0 && item.boxH > 0
    ? (item.boxL * item.boxW * item.boxH) / 1_000_000_000 : 0;
  const qtyPerContainer = cbmPerBox > 0 ? Math.floor(containerCbm / cbmPerBox) * item.qtyPerBox : 0;
  const seaKrw = c.freightSeaUsd != null ? Math.round(c.freightSeaUsd * fxUsd) : (c.freightSea || 0);
  const seaPerUnitUsd = qtyPerContainer > 0 ? seaKrw / qtyPerContainer / fxUsd : 0;
  const otherKrw = (c.freightInland || 0) + (c.freightPort || 0) + (c.freightMisc || 0);
  const otherPerUnitKrw = qtyPerContainer > 0 ? otherKrw / qtyPerContainer : 0;
  const cifUsd = fobUsd + seaPerUnitUsd;
  const dutyRate = item.dutyRateOverride ?? c.dutyRate;
  const dutyPerUnitUsd = cifUsd * dutyRate;
  const eprPerUnitKrw = ((item.weightG || 0) / 1000) * (c.eprObligationRate ?? 0.20) * (c.eprRate || 0);
  const certPerUnitKrw = (item.certs || []).reduce((s, cert) =>
    s + (cert.shipQty > 0 ? cert.totalCostKrw / cert.shipQty : 0), 0);
  return {
    ddpKrw: (cifUsd + dutyPerUnitUsd) * fxUsd + otherPerUnitKrw + eprPerUnitKrw + certPerUnitKrw,
    qtyPerContainer, cbmPerBox,
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dbId = DB.estimatorCases;
  if (!dbId) return NextResponse.json({ error: 'NOTION_DB_ESTIMATOR 환경변수 미설정' }, { status: 503 });

  const db = getDb();
  const row = db.prepare('SELECT * FROM estimator_cases WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '케이스 없음' }, { status: 404 });

  const fxUsd = Number(row.fx_usd) || 1430;
  const fxRmb = Number(row.fx_rmb) || 195;
  const fxUsdSell = Number(row.fx_usd_sell) || fxUsd;
  const fxRmbSell = Number(row.fx_rmb_sell) || fxRmb;
  const dutyRate = Number(row.duty_rate) || 0;
  const eprRate = Number(row.epr_rate) || 0;
  const eprObligationRate = Number(row.epr_obligation_rate) ?? 0.20;
  const items: EstimatorItem[] = (() => { try { return JSON.parse((row.items_json as string) || '[]'); } catch { return []; } })();
  const portFrom = (row.port_from as string) || '';
  const portTo = (row.port_to as string) || '';
  const containerType = (row.container_type as string) || '40ft';

  // 평균 마진 계산
  const caseCtx = { fxUsd, fxRmb, dutyRate, eprRate, eprObligationRate, freightSea: Number(row.freight_sea) || 0,
    freightSeaUsd: row.freight_sea_usd != null ? Number(row.freight_sea_usd) : undefined,
    freightInland: Number(row.freight_inland) || 0, freightPort: Number(row.freight_port) || 0,
    freightMisc: Number(row.freight_misc) || 0, containerType, simMode: (row.sim_mode as string) || 'standard' };

  let totalSellKrw = 0, totalDdpKrw = 0, validCount = 0;
  for (const item of items) {
    const { ddpKrw } = calcDdpKrw(item, caseCtx);
    let sellKrw: number | undefined;
    const sc = item.sellingCurrency || 'USD';
    if (item.sellingPrice && item.sellingPrice > 0) {
      if (sc === 'USD') sellKrw = item.sellingPrice * fxUsdSell;
      else if (sc === 'CNY') sellKrw = item.sellingPrice * fxRmbSell;
      else sellKrw = item.sellingPrice;
    }
    if (sellKrw !== undefined) { totalSellKrw += sellKrw; totalDdpKrw += ddpKrw; validCount++; }
  }
  const avgMargin = totalSellKrw > 0 ? (totalSellKrw - totalDdpKrw) / totalSellKrw : null;

  // Notion properties
  const props: Record<string, unknown> = {
    '케이스명': { title: rt(String(row.name || '')) },
    '컨테이너': { select: { name: String(containerType) } },
    '운송구간': { rich_text: rt(portFrom && portTo ? `${portFrom} → ${portTo}` : portFrom || portTo) },
    '구매환율USD': { number: fxUsd },
    '구매환율RMB': { number: fxRmb },
    '판매환율USD': { number: fxUsdSell },
    '판매환율RMB': { number: fxRmbSell },
    '해상운임USD': { number: row.freight_sea_usd != null ? Number(row.freight_sea_usd) : null },
    '내륙운송': { number: Number(row.freight_inland) || null },
    '포트비': { number: Number(row.freight_port) || null },
    '기타비용': { number: Number(row.freight_misc) || null },
    '관세율': { number: dutyRate },
    'EPR단가': { number: eprRate || null },
    '제품수': { number: items.length },
    '평균마진율': { number: avgMargin != null ? Math.round(avgMargin * 1000) / 10 : null },
    '비고': { rich_text: rt(String(row.notes || '')) },
    '동기화일시': { date: { start: new Date().toISOString() } },
  };

  // 제품 테이블 블록
  const headerCells = ['제품명','통화','FOB가','박스(mm)','입수','무게(g)','관세율','적재수','DDP(원)','판매가','이익율','비고'];
  const tableRows: unknown[] = [
    { object: 'block', type: 'table_row', table_row: { cells: headerCells.map(h => rt(h)) } },
    ...items.map(item => {
      const { ddpKrw, qtyPerContainer } = calcDdpKrw(item, caseCtx);
      const sc = item.sellingCurrency || 'USD';
      let sellKrw: number | undefined;
      if (item.sellingPrice && item.sellingPrice > 0) {
        if (sc === 'USD') sellKrw = item.sellingPrice * fxUsdSell;
        else if (sc === 'CNY') sellKrw = item.sellingPrice * fxRmbSell;
        else sellKrw = item.sellingPrice;
      }
      const margin = sellKrw && sellKrw > 0 ? ((sellKrw - ddpKrw) / sellKrw * 100).toFixed(1) + '%' : '-';
      const certNames = (item.certs || []).map(ce => ce.name).join(', ');
      const bigoArr = [certNames && `인증(${certNames})`, item.note].filter(Boolean);
      return {
        object: 'block', type: 'table_row',
        table_row: {
          cells: [
            rt(item.name || ''),
            rt(item.currency),
            rt(String(item.fobPrice)),
            rt(`${item.boxL}×${item.boxW}×${item.boxH}`),
            rt(String(item.qtyPerBox)),
            rt(item.weightG ? String(item.weightG) : '-'),
            rt(((item.dutyRateOverride ?? dutyRate) * 100).toFixed(1) + '%'),
            rt(qtyPerContainer > 0 ? String(qtyPerContainer) : '-'),
            rt(ddpKrw > 0 ? Math.round(ddpKrw).toLocaleString() + '원' : '-'),
            rt(item.sellingPrice ? `${sc} ${item.sellingPrice}` : '-'),
            rt(margin),
            rt(bigoArr.join(' | ')),
          ],
        },
      };
    }),
  ];

  try {
    const notion = getNotionClient();
    const existingPageId = row.notion_page_id as string | undefined;

    let pageId: string;
    if (existingPageId) {
      await notion.pages.update({ page_id: existingPageId, properties: props as any });
      // 기존 블록 삭제 후 재생성
      const blocks = await notion.blocks.children.list({ block_id: existingPageId });
      await Promise.all(blocks.results.map(b => notion.blocks.delete({ block_id: b.id })));
      pageId = existingPageId;
    } else {
      const page = await notion.pages.create({
        parent: { database_id: dbId },
        properties: props as any,
      });
      pageId = page.id;
    }

    // 제품 테이블 블록 추가
    await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: 'block', type: 'heading_2',
          heading_2: { rich_text: rt('제품 목록') },
        } as any,
        {
          object: 'block', type: 'table',
          table: { table_width: headerCells.length, has_column_header: true, has_row_header: false },
          children: tableRows,
        } as any,
      ],
    });

    const ts = now();
    db.prepare('UPDATE estimator_cases SET notion_page_id=?, notion_synced_at=? WHERE id=?').run(pageId, ts, id);

    return NextResponse.json({ success: true, notionPageId: pageId, syncedAt: ts });
  } catch (e: unknown) {
    console.error('[Estimator] Notion sync error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
