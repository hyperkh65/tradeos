import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';

const SENT_FOLDER_NAMES = [
  'Sent', 'INBOX.Sent', '보낸편지함', '보낸 편지함', '보낸메일함',
  'Sent Items', '[Gmail]/Sent Mail', 'sent',
];

// 1회 API 호출당 최대 fetch 개수
const MAX_PER_CALL = 100;

// UID 범위 문자열로 메시지 일괄 fetch & insert. 삽입된 행 수 반환.
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
    console.error('[sync] fetch error', uidRange, (e as Error).message);
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

    // ── IMAP 폴더 열기 ──────────────────────────────────────────────────────
    let imapFolderName = 'INBOX';
    let lock: import('imapflow').MailboxLockObject;

    if (folder === 'sent') {
      let found = false;
      for (const name of SENT_FOLDER_NAMES) {
        try { lock = await client.getMailboxLock(name); imapFolderName = name; found = true; break; } catch { /* try next */ }
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
    const uidNext = mb?.uidNext;

    if (!uidNext || total === 0 || uidNext <= 1) {
      lock!.release();
      await client.logout();
      return NextResponse.json({ ok: true, count: 0, total, remaining: 0 });
    }

    const highestUid = uidNext - 1;
    const syncedAt = now();

    // ── DB: 저장된 UID 통계 ────────────────────────────────────────────────
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

    // ── DB: 동기화 커서 ────────────────────────────────────────────────────
    // cursor_uid: 다음에 내려받을 범위의 상한 (0이면 완료)
    const cursorRow = db.prepare(
      'SELECT cursor_uid FROM mail_sync_cursors WHERE account_id = ? AND folder = ?'
    ).get(id, folder) as { cursor_uid: number } | undefined;

    let cursor: number;
    if (!cursorRow) {
      // 처음 sync: 이미 저장된 최솟값 바로 아래부터 시작 (없으면 최신 UID 상단부터)
      cursor = minStored !== null ? Math.max(0, minStored - 1) : highestUid;
      db.prepare('INSERT INTO mail_sync_cursors (account_id, folder, cursor_uid) VALUES (?, ?, ?)')
        .run(id, folder, cursor);
    } else {
      cursor = cursorRow.cursor_uid;
    }

    const insertStmt = db.prepare(`
      INSERT INTO mail_ext_messages
        (id, account_id, uid, from_name, from_email, to_json, subject, date, is_read, is_starred, folder, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(account_id, uid) DO NOTHING
    `);

    let count = 0;
    let remaining = 0;

    try {
      // ── A. 신규 메일 (maxStored+1 ~ highestUid), 최대 MAX_PER_CALL ─────
      if (maxStored !== null && maxStored < highestUid) {
        const aStart = maxStored + 1;
        const aEnd = Math.min(aStart + MAX_PER_CALL - 1, highestUid);
        count += await insertByRange(client, `${aStart}:${aEnd}`, insertStmt, id, folder, syncedAt);
        remaining += highestUid - aEnd; // 아직 내려받지 못한 신규 메일 수
      }

      // ── B. 과거 메일: cursor 기반 하향 (A에 remaining이 없을 때) ──────
      if (remaining === 0 && cursor > 0) {
        const cEnd = cursor;
        const cStart = Math.max(1, cEnd - MAX_PER_CALL + 1);
        count += await insertByRange(client, `${cStart}:${cEnd}`, insertStmt, id, folder, syncedAt);
        const newCursor = cStart - 1;
        db.prepare('UPDATE mail_sync_cursors SET cursor_uid = ? WHERE account_id = ? AND folder = ?')
          .run(newCursor, id, folder);
        remaining = newCursor; // 0이면 과거 sync 완료
      }

      // ── C. 첫 sync (DB가 비어있고 cursor도 방금 초기화됨) ─────────────
      if (maxStored === null && cursor === 0) {
        // cursor=0 but no data → fallback: fetch latest block
        const cEnd = highestUid;
        const cStart = Math.max(1, cEnd - MAX_PER_CALL + 1);
        count += await insertByRange(client, `${cStart}:${cEnd}`, insertStmt, id, folder, syncedAt);
        const newCursor = cStart - 1;
        db.prepare('UPDATE mail_sync_cursors SET cursor_uid = ? WHERE account_id = ? AND folder = ?')
          .run(newCursor, id, folder);
        remaining = newCursor;
      }
    } finally {
      lock!.release();
    }

    await client.logout();
    return NextResponse.json({
      ok: true, count, total,
      stored: stats?.stored ?? 0,
      remaining,
      cursor: db.prepare('SELECT cursor_uid FROM mail_sync_cursors WHERE account_id = ? AND folder = ?').get(id, folder),
    });
  } catch (e) {
    console.error('[sync] error', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
