import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { encryptPassword } from '@/lib/mail/crypto';
import { PROVIDERS } from '@/lib/mail/providers';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, provider, label, email, imap_host, imap_port, smtp_host, smtp_port, created_at FROM mail_accounts WHERE user_id = ? ORDER BY created_at ASC'
  ).all(user.id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { provider = 'custom', email, password, imap_host, imap_port, smtp_host, smtp_port } = body;

  if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 });

  const p = PROVIDERS[provider] ?? PROVIDERS.custom;
  const host = imap_host || p.imap_host;
  const port = Number(imap_port || p.imap_port);

  if (!host) return NextResponse.json({ error: 'IMAP 서버를 입력하세요.' }, { status: 400 });

  try {
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host,
      port,
      secure: port === 993 || port === 465,
      auth: { user: email, pass: password },
      logger: false,
    });
    await client.connect();
    await client.logout();
  } catch (e) {
    return NextResponse.json({ error: `연결 실패: ${(e as Error).message}` }, { status: 400 });
  }

  const db = getDb();
  const id = newId();
  db.prepare(`
    INSERT INTO mail_accounts (id, user_id, provider, label, email, password_enc, imap_host, imap_port, smtp_host, smtp_port, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, user.id, provider,
    body.label || email,
    email,
    encryptPassword(password),
    host, port,
    smtp_host || p.smtp_host,
    Number(smtp_port || p.smtp_port),
    now()
  );

  const row = db.prepare(
    'SELECT id, provider, label, email, imap_host, imap_port, smtp_host, smtp_port, created_at FROM mail_accounts WHERE id = ?'
  ).get(id);
  return NextResponse.json(row, { status: 201 });
}
