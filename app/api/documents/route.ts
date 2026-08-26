import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

// doc_type별 문서번호 접두사 - 새 양식을 추가할 때 여기에 한 줄만 추가하면 됨
const PREFIX_MAP: Record<string, string> = {
  official: 'GM',
  import_cost_settlement: 'ICS',
  rfq: 'RFQ',
  sample_request: 'SR',
};

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const docType = searchParams.get('type');
  const q = searchParams.get('q');

  let sql = 'SELECT * FROM documents WHERE 1=1';
  const params: unknown[] = [];
  if (docType) { sql += ' AND doc_type=?'; params.push(docType); }
  if (q) { sql += ' AND (title LIKE ? OR business_id LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const data = rows.map(r => ({
    id: r.id, businessId: r.business_id, docType: r.doc_type, title: r.title, status: r.status,
    data: JSON.parse((r.data_json as string) || '{}'),
    createdByName: r.created_by_name, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const body = await req.json();
  const docType = body.docType as string;
  if (!docType) return NextResponse.json({ error: 'docType이 필요합니다' }, { status: 400 });

  const prefix = PREFIX_MAP[docType] || 'DOC';
  const db = getDb();
  const id = newId();
  const businessId = nextBizId(prefix);
  const ts = now();
  const history = [{ at: ts, by: user.name || user.id, action: '작성' }];

  db.prepare(`INSERT INTO documents (id, business_id, doc_type, title, status, data_json, history_json, created_by, created_by_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, businessId, docType, body.title || '(제목 없음)', body.status || 'draft',
    JSON.stringify(body.data || {}), JSON.stringify(history),
    user.id, user.name || null, ts, ts
  );

  const row = db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({
    data: {
      id: row.id, businessId: row.business_id, docType: row.doc_type, title: row.title, status: row.status,
      data: JSON.parse((row.data_json as string) || '{}'), history: JSON.parse((row.history_json as string) || '[]'),
      createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
    },
  }, { status: 201 });
}
