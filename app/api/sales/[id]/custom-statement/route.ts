import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { createNotionTradeStatement, updateNotionTradeStatement } from '@/lib/notion/mapper';
import { calcTradeStatementTotals, type TradeStatementItem } from '@/lib/trade-statement';

function genDocNo(db: ReturnType<typeof getDb>, issueDate: string): string {
  const datePart = issueDate.replace(/-/g, '');
  const prefix = `YNK${datePart}-`;
  const rows = db.prepare(`SELECT data_json FROM documents WHERE doc_type='trade_statement_custom' AND data_json LIKE ?`)
    .all(`%"docNo":"${prefix}%`) as { data_json: string }[];
  let maxSeq = 0;
  for (const r of rows) {
    try {
      const docNo = (JSON.parse(r.data_json).docNo as string) || '';
      const m = docNo.match(/-(\d+)$/);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    } catch { /* ignore */ }
  }
  return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`SELECT * FROM documents WHERE doc_type='trade_statement_custom' AND related_type='sale' AND related_id=? ORDER BY updated_at DESC LIMIT 1`).get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ data: null });
  return NextResponse.json({ data: { id: row.id, businessId: row.business_id, ...JSON.parse(row.data_json as string) } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id: saleId } = await params;
  const body = await req.json();
  const db = getDb();
  const ts = now();

  const existing = db.prepare(`SELECT * FROM documents WHERE doc_type='trade_statement_custom' AND related_type='sale' AND related_id=? ORDER BY updated_at DESC LIMIT 1`).get(saleId) as Record<string, unknown> | undefined;

  const data = { ...body, saleId };
  const title = `거래명세표(고객양식) - ${data.customer?.name || ''} ${data.issueDate || ''}`.trim();
  const { supplyAmount, vatAmount, totalAmount } = calcTradeStatementTotals((data.items || []) as TradeStatementItem[]);
  const saleRow = db.prepare('SELECT business_id FROM sales WHERE id=?').get(saleId) as { business_id: string } | undefined;

  if (existing) {
    const history: any[] = JSON.parse((existing.history_json as string) || '[]');
    history.push({ data: JSON.parse(existing.data_json as string), changedAt: ts, changedBy: user.name || user.id });
    db.prepare(`UPDATE documents SET title=?, data_json=?, history_json=?, updated_at=? WHERE id=?`)
      .run(title, JSON.stringify(data), JSON.stringify(history), ts, existing.id);

    updateNotionTradeStatement(data.docNo, {
      docNo: data.docNo, saleBusinessId: saleRow?.business_id || '', customerName: data.customer?.name || '',
      issueDate: data.issueDate, supplyAmount, vatAmount, totalAmount, dataJson: JSON.stringify(data),
    }).catch(e => console.error('[TradeStatement] Notion update error:', e));

    return NextResponse.json({ data: { id: existing.id, businessId: existing.business_id, ...data } });
  }

  const issueDate = data.issueDate || ts.slice(0, 10);
  const docNo = data.docNo || genDocNo(db, issueDate);
  const finalData = { ...data, docNo, issueDate };
  const id = newId();
  const businessId = docNo;
  db.prepare(`INSERT INTO documents (id, business_id, doc_type, title, status, data_json, history_json, related_type, related_id, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, businessId, 'trade_statement_custom', title, 'active', JSON.stringify(finalData), '[]', 'sale', saleId, user.id, user.name || '', ts, ts);

  createNotionTradeStatement({
    docNo, saleBusinessId: saleRow?.business_id || '', customerName: finalData.customer?.name || '',
    issueDate, supplyAmount, vatAmount, totalAmount, dataJson: JSON.stringify(finalData),
  }).catch(e => console.error('[TradeStatement] Notion create error:', e));

  return NextResponse.json({ data: { id, businessId, ...finalData } }, { status: 201 });
}
