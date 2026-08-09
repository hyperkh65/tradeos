import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const account = db.prepare(
    'SELECT * FROM mail_accounts WHERE id = ? AND user_id = ?'
  ).get(id, user.id) as Record<string, unknown> | undefined;
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const { ImapFlow } = await import('imapflow');
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
    const mailbox = await client.mailboxOpen('INBOX');
    const total = mailbox.exists;
    const syncedAt = now();
    let count = 0;

    if (total > 0) {
      const start = Math.max(1, total - 49);
      const range = start === total ? `${total}` : `${start}:${total}`;

      const lock = await client.getMailboxLock('INBOX');
      try {
        const stmt = db.prepare(`
          INSERT INTO mail_ext_messages (id, account_id, uid, from_name, from_email, to_json, subject, date, is_read, is_starred, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(account_id, uid) DO UPDATE SET
            is_read = excluded.is_read,
            synced_at = excluded.synced_at
        `);

        for await (const msg of client.fetch(range, { envelope: true, uid: true, flags: true })) {
          const env = msg.envelope as Record<string, unknown>;
          const from = (env?.from as Array<Record<string, string>> | undefined)?.[0];
          const uid = String(msg.uid ?? msg.seq);
          const isRead = (msg.flags as Set<string>)?.has('\\Seen') ? 1 : 0;

          stmt.run(
            newId(), id, uid,
            from?.name || null,
            from?.address || '',
            JSON.stringify(
              ((env?.to as Array<Record<string, string>> | undefined) ?? []).map(t => t.address).filter(Boolean)
            ),
            String(env?.subject || '(제목 없음)'),
            new Date((env?.date as string | Date | undefined) || Date.now()).toISOString(),
            isRead, 0, syncedAt
          );
          count++;
        }
      } finally {
        lock.release();
      }
    }

    await client.logout();
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
