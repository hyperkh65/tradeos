import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { dbToImport } from '../../route';
import { syncImportExpenses } from '@/lib/import-helpers';
import { createNotionImportSettlement } from '@/lib/notion/mapper';
import type { SettlementHistoryEntry } from '@/types';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { id } = await params;
    const body = await req.json(); // { action: 'close'|'reopen', settlementItems?, note? }
    const db = getDb();
    const row = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const ts = now();
    const action = body.action as 'close' | 'reopen';

    // reopen은 관리자만
    if (action === 'reopen' && user.role !== 'admin') {
      return NextResponse.json({ error: '마감 해제는 관리자만 가능합니다.' }, { status: 403 });
    }

    const prevHistory: SettlementHistoryEntry[] = (() => {
      try { return JSON.parse((row.settlement_history_json as string) || '[]'); } catch { return []; }
    })();

    const historyEntry: SettlementHistoryEntry = {
      at: ts, by: user.name || user.id,
      action: action === 'close' ? '마감' : '마감해제',
      note: body.note || undefined,
    };

    const newHistory = [...prevHistory, historyEntry];
    const settlementItems = body.settlementItems !== undefined
      ? JSON.stringify(body.settlementItems)
      : (row.settlement_json as string || '[]');

    db.prepare(`UPDATE imports SET
      settlement_status=?, settlement_json=?, settlement_history_json=?,
      closed_at=?, closed_by=?, updated_at=?
      WHERE id=?`).run(
      action === 'close' ? 'closed' : 'open',
      settlementItems,
      JSON.stringify(newHistory),
      action === 'close' ? ts : null,
      action === 'close' ? user.id : null,
      ts, id,
    );

    // 마감 시 비용 최종 확정 (정산 항목 기준으로 expenses 재동기화)
    if (action === 'close') {
      const updated = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown>;
      const customCosts = (() => { try { return JSON.parse((updated.custom_costs_json as string) || '[]'); } catch { return []; } })();
      syncImportExpenses(db, id, row.business_id as string, {
        freightKrw: updated.freight_krw as number | undefined,
        freightHandling: (() => { try { return JSON.parse((updated.freight_handling_json as string) || '[]'); } catch { return []; } })(),
        duty: updated.duty as number | undefined,
        vat: updated.vat as number | undefined,
        brokerFee: updated.broker_fee as number | undefined,
        inspectionFee: updated.inspection_fee as number | undefined,
        warehouseFee: updated.warehouse_fee as number | undefined,
        detentionFee: updated.detention_fee as number | undefined,
        demurrage: updated.demurrage as number | undefined,
        inlandFreight: updated.inland_freight as number | undefined,
        customCosts,
        createdBy: user.id,
      });
    }

    const final = db.prepare('SELECT * FROM imports WHERE id=?').get(id) as Record<string, unknown>;
    const finalImp = dbToImport(final);

    // 마감 시 Notion 정산서 저장 (비동기, 실패해도 메인 응답에 영향 없음)
    if (action === 'close') {
      createNotionImportSettlement(finalImp).then(notionId => {
        if (notionId) {
          db.prepare('UPDATE imports SET notion_id=? WHERE id=?').run(notionId, id);
        }
      }).catch(e => console.error('[close] Notion settlement save failed:', e));
    }

    return NextResponse.json({ data: finalImp });
  } catch (e) {
    console.error('[imports close]', e);
    return NextResponse.json({ error: '처리 실패' }, { status: 500 });
  }
}
