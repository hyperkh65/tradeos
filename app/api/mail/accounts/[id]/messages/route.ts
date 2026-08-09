import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const account = db.prepare(
    'SELECT id FROM mail_accounts WHERE id = ? AND user_id = ?'
  ).get(id, user.id);
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rows = db.prepare(
    'SELECT * FROM mail_ext_messages WHERE account_id = ? ORDER BY date DESC LIMIT 100'
  ).all(id);
  return NextResponse.json(rows);
}

// Fetch body for a specific message (uid)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { uid } = await req.json();

  const db = getDb();
  const account = db.prepare(
    'SELECT * FROM mail_accounts WHERE id = ? AND user_id = ?'
  ).get(id, user.id) as Record<string, unknown> | undefined;
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check cached body — skip if it looks like mojibake
  const cached = db.prepare(
    'SELECT body_text FROM mail_ext_messages WHERE account_id = ? AND uid = ?'
  ).get(id, uid) as { body_text: string | null } | undefined;
  const isMojibake = (s: string) => /â€|Ã\s|ì\s|ë\s|í\s|ð\s/.test(s);
  if (cached?.body_text && !isMojibake(cached.body_text)) {
    return NextResponse.json({ body: cached.body_text });
  }

  // Fetch from IMAP
  try {
    const { ImapFlow } = await import('imapflow');
    const { simpleParser } = await import('mailparser');
    const password = decryptPassword(account.password_enc as string);
    const port = account.imap_port as number;

    const client = new ImapFlow({
      host: account.imap_host as string,
      port,
      secure: port === 993 || port === 465,
      auth: { user: account.email as string, pass: password },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let bodyText = '';

    try {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      const src = msg && (msg as unknown as Record<string, unknown>).source;
      if (src) {
        const buf = Buffer.isBuffer(src) ? src : Buffer.from(String(src), 'binary');
        const parsed = await simpleParser(buf);
        // Prefer HTML (rendered in iframe), fallback to plain text
        bodyText = parsed.html || parsed.textAsHtml || parsed.text || '';
      }
    } finally {
      lock.release();
    }

    await client.logout();

    // Cache body
    db.prepare(
      'UPDATE mail_ext_messages SET body_text = ? WHERE account_id = ? AND uid = ?'
    ).run(bodyText, id, uid);

    return NextResponse.json({ body: bodyText });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
