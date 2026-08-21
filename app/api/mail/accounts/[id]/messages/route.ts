import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const account = db.prepare(
    'SELECT id FROM mail_accounts WHERE id = ? AND user_id = ?'
  ).get(id, user.id);
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const folder = url.searchParams.get('folder') || 'inbox';
  const limitParam = Number(url.searchParams.get('limit') || '0');
  const rows = limitParam === 0
    ? db.prepare('SELECT * FROM mail_ext_messages WHERE account_id = ? AND folder = ? ORDER BY date DESC').all(id, folder)
    : db.prepare('SELECT * FROM mail_ext_messages WHERE account_id = ? AND folder = ? ORDER BY date DESC LIMIT ?').all(id, folder, limitParam);
  return NextResponse.json(rows);
}

const SENT_FOLDER_NAMES = [
  'Sent', 'INBOX.Sent', '보낸편지함', '보낸 편지함', '보낸메일함',
  'Sent Items', '[Gmail]/Sent Mail', 'sent',
];

// Fetch body for a specific message (uid)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { uid } = await req.json();
  const folder = new URL(req.url).searchParams.get('folder') || 'inbox';

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

  // local_ prefix = locally sent mail with body already saved; won't be here without body_text
  if (uid.startsWith('local_')) {
    return NextResponse.json({ body: '(본문을 불러올 수 없습니다)' });
  }

  // Fetch from IMAP
  try {
    const { ImapFlow } = await import('imapflow');
    const { simpleParser } = await import('mailparser');
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
    });

    await client.connect();

    // For sent folder (uid prefixed with s_), find the right IMAP folder
    let imapFolder = 'INBOX';
    let imapUid = uid;
    if (folder === 'sent' || uid.startsWith('s_')) {
      imapUid = uid.startsWith('s_') ? uid.slice(2) : uid;
      let found = false;
      for (const name of SENT_FOLDER_NAMES) {
        try { await client.mailboxOpen(name); imapFolder = name; found = true; break; } catch { /* try next */ }
      }
      if (!found) { await client.logout(); return NextResponse.json({ body: '(보낸편지함을 찾을 수 없습니다)' }); }
    }

    const lock = await client.getMailboxLock(imapFolder);
    let bodyText = '';

    try {
      const msg = await client.fetchOne(imapUid, { source: true }, { uid: true });
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const account = db.prepare('SELECT id FROM mail_accounts WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { uid, is_read, is_starred } = await req.json();
  const updates: string[] = [];
  const vals: unknown[] = [];
  if (is_read !== undefined) { updates.push('is_read = ?'); vals.push(is_read); }
  if (is_starred !== undefined) { updates.push('is_starred = ?'); vals.push(is_starred); }
  if (updates.length === 0) return NextResponse.json({ ok: true });

  db.prepare(`UPDATE mail_ext_messages SET ${updates.join(', ')} WHERE account_id = ? AND uid = ?`)
    .run(...vals, id, uid);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const account = db.prepare('SELECT id FROM mail_accounts WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { uid } = await req.json();
  db.prepare('DELETE FROM mail_ext_messages WHERE account_id = ? AND uid = ?').run(id, uid);
  return NextResponse.json({ ok: true });
}

