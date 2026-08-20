import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';

const SENT_FOLDER_NAMES = [
  'Sent', 'INBOX.Sent', '보낸편지함', '보낸 편지함', '보낸메일함',
  'Sent Items', '[Gmail]/Sent Mail', 'sent',
];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const folder = new URL(req.url).searchParams.get('folder') || 'inbox';

  const db = getDb();
  const account = db.prepare(
    'SELECT * FROM mail_accounts WHERE id = ? AND user_id = ?'
  ).get(id, user.id) as Record<string, unknown> | undefined;
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const { ImapFlow } = await import('imapflow');
    let password: string;
    try {
      password = decryptPassword(account.password_enc as string);
    } catch {
      return NextResponse.json({ error: '비밀번호 복호화 실패 - 메일 계정을 삭제하고 다시 등록해주세요.' }, { status: 400 });
    }
    const port = account.imap_port as number;

    const client = new ImapFlow({
      host: account.imap_host as string,
      port,
      secure: port === 993 || port === 465,
      auth: { user: account.email as string, pass: password },
      logger: false,
    });

    await client.connect();

    let imapFolderName = 'INBOX';
    let mailbox;

    if (folder === 'sent') {
      let found = false;
      for (const name of SENT_FOLDER_NAMES) {
        try {
          mailbox = await client.mailboxOpen(name);
          imapFolderName = name;
          found = true;
          break;
        } catch { /* try next */ }
      }
      if (!found) {
        await client.logout();
        return NextResponse.json({ error: '보낸편지함을 찾을 수 없습니다. 메일 제공자에서 IMAP 보낸편지함 설정을 확인하세요.' }, { status: 404 });
      }
    } else {
      mailbox = await client.mailboxOpen('INBOX');
    }

    const total = (mailbox as { exists: number }).exists;
    const syncedAt = now();
    let count = 0;

    // limit=0 이면 전체, 기본 300
    const limitParam = Number(new URL(req.url).searchParams.get('limit') || '300');
    const fetchAll = limitParam === 0;

    if (total > 0) {
      const start = fetchAll ? 1 : Math.max(1, total - limitParam + 1);
      const range = start === total ? `${total}` : `${start}:${total}`;

      const lock = await client.getMailboxLock(imapFolderName);
      try {
        const stmt = db.prepare(`
          INSERT INTO mail_ext_messages (id, account_id, uid, from_name, from_email, to_json, subject, date, is_read, is_starred, folder, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(account_id, uid) DO UPDATE SET
            is_read = excluded.is_read,
            folder = excluded.folder,
            synced_at = excluded.synced_at
        `);

        for await (const msg of client.fetch(range, { envelope: true, uid: true, flags: true })) {
          const env = msg.envelope as Record<string, unknown>;
          const from = (env?.from as Array<Record<string, string>> | undefined)?.[0];
          const rawUid = String(msg.uid ?? msg.seq);
          const uid = folder === 'sent' ? `s_${rawUid}` : rawUid;
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
            isRead, 0, folder, syncedAt
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
