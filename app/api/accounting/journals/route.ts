import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

function nextEntryNo(db: ReturnType<typeof getDb>) {
  const year = new Date().getFullYear();
  const row = db.prepare("SELECT COUNT(*) as n FROM journal_entries WHERE entry_no LIKE ?").get(`J-${year}-%`) as {n:number};
  return `J-${year}-${String(row.n + 1).padStart(4,'0')}`;
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let q = 'SELECT * FROM journal_entries WHERE 1=1';
  const p: unknown[] = [];
  if (status) { q += ' AND status=?'; p.push(status); }
  if (type) { q += ' AND entry_type=?'; p.push(type); }
  if (from) { q += ' AND entry_date>=?'; p.push(from); }
  if (to) { q += ' AND entry_date<=?'; p.push(to); }
  q += ' ORDER BY entry_date DESC, entry_no DESC';

  const entries = db.prepare(q).all(...p) as Record<string,unknown>[];
  const result = entries.map(e => ({
    ...e,
    lines: db.prepare('SELECT * FROM journal_lines WHERE entry_id=? ORDER BY line_no').all(e.id),
  }));
  return NextResponse.json({ data: result });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const ts = now();

  const lines = (body.lines || []) as Array<{account_code:string;account_name:string;debit:number;credit:number;currency?:string;fx_rate?:number;memo?:string}>;
  const debitTotal = lines.reduce((s,l) => s + (Number(l.debit)||0), 0);
  const creditTotal = lines.reduce((s,l) => s + (Number(l.credit)||0), 0);

  // related_ref가 있으면 기존 전표 삭제 후 재생성 (중복 방지)
  let existingId: string | null = null;
  let entryNo: string;
  if (body.related_ref) {
    const existing = db.prepare('SELECT id, entry_no FROM journal_entries WHERE related_ref=?').get(body.related_ref) as { id: string; entry_no: string } | undefined;
    if (existing) {
      existingId = existing.id;
      entryNo = existing.entry_no; // 전표번호 유지
    } else {
      entryNo = nextEntryNo(db);
    }
  } else {
    entryNo = nextEntryNo(db);
  }

  const id = existingId || newId();

  db.transaction(() => {
    if (existingId) {
      db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(existingId);
      db.prepare(`UPDATE journal_entries SET entry_date=?,entry_type=?,description=?,status=?,debit_total=?,credit_total=?,doc_no=?,updated_at=? WHERE id=?`)
        .run(body.entry_date, body.entry_type, body.description, body.status || 'posted', debitTotal, creditTotal, body.doc_no || null, ts, existingId);
    } else {
      db.prepare(`INSERT INTO journal_entries (id,entry_no,entry_date,entry_type,description,status,created_by,related_ref,doc_no,debit_total,credit_total,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, entryNo, body.entry_date, body.entry_type, body.description,
             body.status || 'posted', body.created_by || null, body.related_ref || null, body.doc_no || null,
             debitTotal, creditTotal, ts, ts);
    }
    lines.forEach((l, i) => {
      db.prepare(`INSERT INTO journal_lines (id,entry_id,line_no,account_code,account_name,debit,credit,currency,fx_rate,memo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(newId(), id, i+1, l.account_code, l.account_name, Number(l.debit)||0, Number(l.credit)||0,
             l.currency||'KRW', l.fx_rate||1, l.memo||null, ts);
    });
  })();

  const entry = db.prepare('SELECT * FROM journal_entries WHERE id=?').get(id) as Record<string, unknown>;
  const entryLines = db.prepare('SELECT * FROM journal_lines WHERE entry_id=? ORDER BY line_no').all(id);
  const isUpdated = !!existingId;
  return NextResponse.json({ data: { ...entry, lines: entryLines }, updated: isUpdated }, { status: isUpdated ? 200 : 201 });
}
