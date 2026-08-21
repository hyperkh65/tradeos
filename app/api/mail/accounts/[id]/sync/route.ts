import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';

const SENT_FOLDER_NAMES = [
  'Sent', 'INBOX.Sent', '보낸편지함', '보낸 편지함', '보낸메일함',
  'Sent Items', '[Gmail]/Sent Mail', 'sent',
];

const MAX_PER_CALL = 200;

// Fetch messages in a UID range string (e.g. '1:200', '4801:5000') and insert them
async function insertByRange(
  client: import('imapflow').ImapFlow,
  uidRange: string,
  insertStmt: import('better-sqlite3').Statement,
  accountId: string,
  folder: string,
  syncedAt: string,
): Promise<number> {
  let count = 0;
  try {
    for await (const msg of client.fetch(uidRange, { envelope: true, uid: true, flags: true }, { uid: true })) {
      const env = msg.envelope as Record<string, unknown>;
      const from = (env?.from as Array<Record<string, string>> | undefined)?.[0];
      const rawUid = String(msg.uid);
      const storedUid = folder === 'sent' ? `s_${rawUid}` : rawUid;
      const isRead = (msg.flags as Set<string>)?.has('\\Seen') ? 1 : 0;
      try {
        insertStmt.run(
          newId(), accountId, storedUid,
          from?.name || null,
          from?.address || '',
          JSON.stringify(((env?.to as Array<Record<string, string>> | undefined) ?? []).map(t => t.address).filter(Boolean)),
          String(env?.subject || '(제목 없음)'),
          new Date((env?.date as string | Date | undefined) || Date.now()).toISOString(),
          isRead, folder, syncedAt,
        );
        count++;
      } catch { /* ON CONFLICT DO NOTHING */ }
    }
  } catch (e) {
    console.error('[sync] fetch range error', uidRange, (e as Error).message);
  }
  return count;
}

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
    try { password = decryptPassword(account.password_enc as string); } catch {
      return NextResponse.json({ error: '비밀번호 복호화 실패 - 메일 계정을 삭제하고 다시 등록해주세요.' }, { status: 400 });
    }

    const port = account.imap_port as number;
    const client = new ImapFlow({
      host: account.imap_host as string,
      port,
      secure: port === 993 || port === 465,
      auth: { user: account.email as string, pass: password },
      logger: false,
      tls: { rejectUnauthorized: false },
    });

    await client.connect();

    // Determine IMAP folder name and open via lock
    let imapFolderName = 'INBOX';
    let lock: import('imapflow').MailboxLockObject | null = null;

    if (folder === 'sent') {
      let found = false;
      for (const name of SENT_FOLDER_NAMES) {
        try {
          lock = await client.getMailboxLock(name);
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
      lock = await client.getMailboxLock('INBOX');
    }

    const mb = client.mailbox as { exists: number; uidNext: number } | null;
    const total = mb?.exists ?? 0;
    const uidNext = mb?.uidNext ?? (total + 1);

    if (total === 0 || uidNext <= 1) {
      lock!.release();
      await client.logout();
      return NextResponse.json({ ok: true, count: 0, total, remaining: 0 });
    }

    // Get stored UID stats from DB
    const stats = db.prepare(`
      SELECT
        MIN(CAST(REPLACE(uid,'s_','') AS INTEGER)) as min_uid,
        MAX(CAST(REPLACE(uid,'s_','') AS INTEGER)) as max_uid,
        COUNT(*) as stored
      FROM mail_ext_messages
      WHERE account_id = ? AND folder = ? AND uid NOT LIKE 'local_%'
    `).get(id, folder) as { min_uid: number | null; max_uid: number | null; stored: number };

    const maxStored = stats?.max_uid ?? null;
    const minStored = stats?.min_uid ?? null;

    const insertStmt = db.prepare(`
      INSERT INTO mail_ext_messages
        (id, account_id, uid, from_name, from_email, to_json, subject, date, is_read, is_starred, folder, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(account_id, uid) DO NOTHING
    `);

    const syncedAt = now();
    let count = 0;
    let remaining = 0;
    const highestUid = uidNext - 1;

    try {
      // ── A. 새 메일 (maxStored+1 ~ highestUid) ────────────────────────────
      if (maxStored !== null && maxStored < highestUid) {
        const rangeStart = maxStored + 1;
        count += await insertByRange(client, `${rangeStart}:${highestUid}`, insertStmt, id, folder, syncedAt);
      }

      // ── B. 구형 메일 or 첫 동기화 ────────────────────────────────────────
      let rangeStart: number;
      let rangeEnd: number;

      if (minStored !== null && minStored > 1) {
        // 기존 min_uid보다 오래된 메일
        rangeEnd = minStored - 1;
        rangeStart = Math.max(1, rangeEnd - MAX_PER_CALL + 1);
        remaining = rangeStart > 1 ? rangeStart - 1 : 0;
        count += await insertByRange(client, `${rangeStart}:${rangeEnd}`, insertStmt, id, folder, syncedAt);
      } else if (maxStored === null) {
        // 첫 동기화: 최신 MAX_PER_CALL개 먼저
        rangeEnd = highestUid;
        rangeStart = Math.max(1, rangeEnd - MAX_PER_CALL + 1);
        remaining = rangeStart > 1 ? rangeStart - 1 : 0;
        count += await insertByRange(client, `${rangeStart}:${rangeEnd}`, insertStmt, id, folder, syncedAt);
      }
    } finally {
      lock!.release();
    }

    await client.logout();
    return NextResponse.json({ ok: true, count, total, stored: stats?.stored ?? 0, remaining, imapFolder: imapFolderName });
  } catch (e) {
    console.error('[sync] error', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
