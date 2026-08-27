import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { fetchNotionQuotes, createNotionQuote } from '@/lib/notion/mapper';
import type { Quote } from '@/types';
import { createCalendarEvent } from '@/lib/calendar-events';

export function dbToQuote(row: Record<string, unknown>): Quote & Record<string, unknown> {
  const items = JSON.parse((row.items_json as string) || '[]').map((it: any) => ({
    ...it,
    amount: it.amount ?? (it.quantity ?? it.qty ?? 0) * (it.unitPrice ?? 0),
  }));
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    type: (row.type as Quote['type']) || 'customer',
    companyId: (row.company_id as string) || '',
    companyName: (row.company_name as string) || '',
    items,
    currency: (row.currency as string) || 'KRW',
    incoterm: (row.incoterm as string) || undefined,
    paymentTerms: (row.payment_terms as string) || undefined,
    validity: (row.validity as string) || undefined,
    status: (row.status as Quote['status']) || 'draft',
    remark: (row.remark as string) || undefined,
    createdBy: (row.created_by as string) || 'user-1',
    createdAt: row.created_at as string,
    quoteDate: (row.quote_date as string) || (row.created_at as string)?.slice(0, 10),
    totalAmount: (row.total_amount as number) || items.reduce((s: number, i: any) => s + (i.amount || 0), 0),
    updatedAt: (row.updated_at as string) || undefined,
    updatedBy: (row.updated_by as string) || undefined,
    createdByName: (row.created_by_name as string) || undefined,
    createdByEmail: (row.created_by_email as string) || undefined,
    imagesJson: (row.images_json as string) || undefined,
    historyJson: (row.history_json as string) || '[]',
    docType: (row.doc_type as string) || 'QUOTE',
    specialNotes: (row.special_notes as string) || undefined,
    generalInfo: (row.general_info as string) || undefined,
  };
}

const UPSERT = `INSERT OR REPLACE INTO quotes
  (id,business_id,type,company_id,company_name,items_json,currency,incoterm,payment_terms,
   validity,status,remark,created_by,created_by_name,notion_id,created_at,
   quote_date,total_amount,images_json,history_json,doc_type,special_notes,general_info,created_by_email)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all() as Record<string, unknown>[];

  try {
    const notionQuotes = await fetchNotionQuotes();
    if (notionQuotes.length > 0) {
      // INSERT OR IGNORE: never overwrite existing local data
      const insert = db.prepare(UPSERT.replace('INSERT OR REPLACE', 'INSERT OR IGNORE'));
      db.transaction(() => {
        for (const q of notionQuotes) {
          // Check by BOTH id AND business_id (local id ≠ Notion page id)
          const existing = db.prepare(
            'SELECT id FROM quotes WHERE id=? OR business_id=?'
          ).get(q.id, q.businessId);
          if (existing) continue; // local data always wins
          const totalAmount = q.items.reduce((s, it) => s + ((it as any).amount || it.unitPrice * ((it as any).quantity || (it as any).qty || 0)), 0);
          insert.run(
            q.id, q.businessId, q.type || 'customer', q.companyId ?? null, q.companyName,
            JSON.stringify(q.items), q.currency, q.incoterm ?? null, q.paymentTerms ?? null,
            q.validity ?? null, q.status || 'sent', q.remark ?? null,
            q.createdBy || 'ynk-erp', null, q.id,
            q.createdAt, q.createdAt?.slice(0, 10), totalAmount, null, '[]',
            'QUOTE', null, null, null,
          );
        }
      })();
    }
  } catch (e) {
    console.error('[Quote] Notion fetch error:', e);
  }

  const updated = db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const data = updated.length > 0 ? updated : rows;
  return NextResponse.json({ data: data.map(dbToQuote) });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();

    const bizId = body.businessId || nextBizId('QT');

    // 5초 내 동일 업체+동일 품목수 중복 제출 방지
    const recentDup = db.prepare(`
      SELECT id FROM quotes
      WHERE company_name = ? AND created_at > ? AND json_array_length(items_json) = ?
    `).get(
      body.companyName || '',
      new Date(Date.now() - 5000).toISOString(),
      (body.items || []).length
    ) as { id: string } | undefined;
    if (recentDup) {
      return NextResponse.json({ error: '동일한 견적서가 방금 저장되었습니다. 잠시 후 다시 시도하세요.' }, { status: 409 });
    }

    const items = (body.items || []).map((it: any) => ({
      ...it,
      amount: it.amount ?? it.quantity * it.unitPrice,
    }));
    const totalAmount = items.reduce((s: number, it: any) => s + (it.amount || 0), 0);
    const quoteDate = body.quoteDate || ts.slice(0, 10);
    const actorName = user?.name || body.createdByName || '알 수 없음';
    const historyEntry = { at: ts, by: actorName, action: '생성' };

    const q: Quote = {
      id, businessId: bizId,
      type: body.type || 'customer',
      companyId: body.companyId || '',
      companyName: body.companyName || '',
      items,
      currency: body.currency || 'KRW',
      incoterm: body.incoterm,
      paymentTerms: body.paymentTerms,
      validity: body.validity,
      status: body.status || 'draft',
      remark: body.remark,
      createdBy: user?.id || 'unknown',
      createdAt: ts,
    };

    // 동시 요청 시 노션 API 대기 중 중복 제출 방지 창이 열리지 않도록 먼저 SQLite에 커밋
    db.prepare(UPSERT).run(
      id, bizId, body.type || 'customer', body.companyId ?? null, body.companyName,
      JSON.stringify(items), body.currency || 'KRW', body.incoterm ?? null, body.paymentTerms ?? null,
      body.validity ?? null, body.status || 'draft', body.remark ?? null,
      user?.id || 'unknown', actorName, null, ts,
      quoteDate, totalAmount, body.imagesJson ?? null, JSON.stringify([historyEntry]),
      body.docType ?? 'QUOTE', body.specialNotes ?? null, body.generalInfo ?? null,
      user?.email ?? null,
    );

    createNotionQuote(q).then(notionId => {
      if (notionId) db.prepare('UPDATE quotes SET notion_id=? WHERE id=?').run(notionId, id);
    }).catch(() => {});

    // validity 있으면 캘린더 이벤트 자동 생성
    if (body.validity) {
      createCalendarEvent({
        title: `견적 만료: ${body.companyName}`,
        date: body.validity,
        category: 'quote',
        relatedId: id,
        userId: user?.id || 'unknown',
        userName: user?.name || '알 수 없음',
      }).catch(() => {});
    }

    return NextResponse.json({ data: { ...dbToQuote({ ...q as any, id, business_id: bizId, created_at: ts, quote_date: quoteDate, total_amount: totalAmount, history_json: JSON.stringify([historyEntry]), created_by_name: actorName, created_by_email: user?.email ?? null }) } }, { status: 201 });
  } catch (e) {
    console.error('[Quote] POST error:', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
