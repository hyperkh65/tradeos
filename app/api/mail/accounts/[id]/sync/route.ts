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
        return NextResponse.json({ error: '보낸편지함을 찾을 수 없습니다.' }, { status: 404 });
      }
    } else {
      mailbox = await client.mailboxOpen('INBOX');
    }

    const total = (mailbox as { exists: number }).exists;
    if (total === 0) {
      await client.logout();
      return NextResponse.json({ ok: true, count: 0, total: 0 });
    }

    const syncedAt = now();
    let count = 0;

    // Step 1: Get UIDs already stored in DB for this folder
    const storedRows = db.prepare(
      'SELECT uid FROM mail_ext_messages WHERE account_id = ? AND folder = ?'
    ).all(id, folder) as { uid: string }[];

    const storedUidSet = new Set(
      storedRows.map(r => {
        const raw = folder === 'sent' ? r.uid.replace(/^s_/, '') : r.uid;
        return parseInt(raw, 10);
      }).filter(n => !isNaN(n))
    );

    const lock = await client.getMailboxLock(imapFolderName);
    try {
      // Step 2: Scan all messages on server to find UIDs we're missing
      // (envelope-only scan is fast even for large mailboxes)
      const missingUids: number[] = [];
      const updateFlags: { uid: number; isRead: number }[] = [];

      for await (const msg of client.fetch('1:*', { uid: true, flags: true }, { uid: true })) {
        const uid = msg.uid;
        if (!storedUidSet.has(uid)) {
          missingUids.push(uid);
        } else {
          // Update read status for existing messages
          updateFlags.push({ uid, isRead: (msg.flags as Set<string>).has('\\Seen') ? 1 : 0 });
        }
      }

      // Step 3: Update read flags for already-stored messages
      if (updateFlags.length > 0) {
        const updateStmt = db.prepare(
          'UPDATE mail_ext_messages SET is_read = ?, synced_at = ? WHERE account_id = ? AND uid = ?'
        );
        db.transaction(() => {
          for (const { uid, isRead } of updateFlags) {
            const storedUid = folder === 'sent' ? `s_${uid}` : String(uid);
            updateStmt.run(isRead, syncedAt, id, storedUid);
          }
        })();
      }

      // Step 4: Fetch envelopes only for missing messages
      if (missingUids.length > 0) {
        const insertStmt = db.prepare(`
          INSERT INTO mail_ext_messages
            (id, account_id, uid, from_name, from_email, to_json, subject, date, is_read, is_starred, folder, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
          ON CONFLICT(account_id, uid) DO NOTHING
        `);

        // Fetch in batches to avoid timeouts on very large mailboxes
        const BATCH = 500;
        for (let i = 0; i < missingUids.length; i += BATCH) {
          const batch = missingUids.slice(i, i + BATCH);
          const uidRange = batch.join(',');
          for await (const msg of client.fetch(uidRange, { envelope: true, uid: true, flags: true }, { uid: true })) {
            const env = msg.envelope as Record<string, unknown>;
            const from = (env?.from as Array<Record<string, string>> | undefined)?.[0];
            const rawUid = String(msg.uid);
            const storedUid = folder === 'sent' ? `s_${rawUid}` : rawUid;
            const isRead = (msg.flags as Set<string>)?.has('\\Seen') ? 1 : 0;

            insertStmt.run(
              newId(), id, storedUid,
              from?.name || null,
              from?.address || '',
              JSON.stringify(
                ((env?.to as Array<Record<string, string>> | undefined) ?? []).map(t => t.address).filter(Boolean)
              ),
              String(env?.subject || '(제목 없음)'),
              new Date((env?.date as string | Date | undefined) || Date.now()).toISOString(),
              isRead, folder, syncedAt
            );
            count++;
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return NextResponse.json({ ok: true, count, total, stored: storedRows.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
