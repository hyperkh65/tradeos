import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM mail_contacts WHERE user_id = ? ORDER BY name ASC, email ASC'
  ).all(user.id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, email } = await req.json();
  if (!email) return NextResponse.json({ error: '이메일을 입력하세요.' }, { status: 400 });
  const db = getDb();
  try {
    db.prepare(
      'INSERT INTO mail_contacts (id, user_id, name, email, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(newId(), user.id, name ?? '', email.trim().toLowerCase(), now());
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '이미 저장된 주소입니다.' }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  const db = getDb();
  db.prepare('DELETE FROM mail_contacts WHERE id = ? AND user_id = ?').run(id, user.id);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, name, email } = await req.json();
  const db = getDb();
  try {
    if (email !== undefined) {
      db.prepare('UPDATE mail_contacts SET name = ?, email = ? WHERE id = ? AND user_id = ?')
        .run(name ?? '', email.trim().toLowerCase(), id, user.id);
    } else {
      db.prepare('UPDATE mail_contacts SET name = ? WHERE id = ? AND user_id = ?').run(name ?? '', id, user.id);
    }
  } catch {
    return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
