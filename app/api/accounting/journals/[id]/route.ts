import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';

export async function GET(_req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const db = getDb();
  const entry = db.prepare('SELECT * FROM journal_entries WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!entry) return NextResponse.json({ error: '없음' }, { status: 404 });
  const lines = db.prepare('SELECT * FROM journal_lines WHERE entry_id=? ORDER BY line_no').all(id);
  return NextResponse.json({ data: { ...entry, lines } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const ts = now();
  const lines = (body.lines || []) as Array<{account_code:string;account_name:string;debit:number;credit:number;currency?:string;fx_rate?:number;memo?:string}>;
  const debitTotal = lines.reduce((s,l) => s + (Number(l.debit)||0), 0);
  const creditTotal = lines.reduce((s,l) => s + (Number(l.credit)||0), 0);

  db.transaction(() => {
    db.prepare(`UPDATE journal_entries SET entry_date=?,entry_type=?,description=?,status=?,related_ref=?,debit_total=?,credit_total=?,updated_at=? WHERE id=?`)
      .run(body.entry_date, body.entry_type, body.description, body.status||'posted', body.related_ref||null, debitTotal, creditTotal, ts, id);
    db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(id);
    lines.forEach((l, i) => {
      db.prepare(`INSERT INTO journal_lines (id,entry_id,line_no,account_code,account_name,debit,credit,currency,fx_rate,memo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(newId(), id, i+1, l.account_code, l.account_name, Number(l.debit)||0, Number(l.credit)||0,
             l.currency||'KRW', l.fx_rate||1, l.memo||null, ts);
    });
  })();

  const entry = db.prepare('SELECT * FROM journal_entries WHERE id=?').get(id) as Record<string, unknown>;
  const entryLines = db.prepare('SELECT * FROM journal_lines WHERE entry_id=? ORDER BY line_no').all(id);
  return NextResponse.json({ data: { ...entry, lines: entryLines } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM journal_lines WHERE entry_id=?').run(id);
    db.prepare('DELETE FROM journal_entries WHERE id=?').run(id);
  })();
  return NextResponse.json({ success: true });
}
