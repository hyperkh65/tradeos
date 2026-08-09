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

  // Check cached body — skip if it looks like mojibake (stale pre-fix cache)
  const cached = db.prepare(
    'SELECT body_text FROM mail_ext_messages WHERE account_id = ? AND uid = ?'
  ).get(id, uid) as { body_text: string | null } | undefined;
  const isMojibake = (s: string) => /â€|Ã |ì |ë |í |ð |â¤/.test(s);
  if (cached?.body_text && !isMojibake(cached.body_text)) {
    return NextResponse.json({ body: cached.body_text });
  }

  // Fetch from IMAP
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
    const lock = await client.getMailboxLock('INBOX');
    let bodyText = '';

    try {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      const src = msg && (msg as unknown as Record<string, unknown>).source;
      if (src) {
        // Use latin1 to preserve raw bytes; charset-aware decoding happens inside
        const raw = Buffer.isBuffer(src) ? src.toString('latin1') : String(src);
        bodyText = extractTextFromRaw(raw);
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

function extractTextFromRaw(raw: string): string {
  // Extract text/plain from raw email
  const lines = raw.replace(/\r\n/g, '\n');

  // Check content-type header
  const ctMatch = lines.match(/^Content-Type:\s*([^\n;]+)/im);
  const contentType = ctMatch?.[1]?.trim().toLowerCase() ?? '';

  if (contentType.startsWith('multipart/')) {
    const boundaryMatch = lines.match(/boundary="?([^"\n;]+)"?/i);
    const boundary = boundaryMatch?.[1];
    if (boundary) {
      const parts = lines.split('--' + boundary);
      for (const part of parts) {
        const partCt = part.match(/Content-Type:\s*text\/plain/i);
        if (partCt) {
          const bodyStart = part.indexOf('\n\n');
          if (bodyStart !== -1) {
            return decodeEmailBody(part.slice(bodyStart + 2).replace(/--$/, '').trim(), part);
          }
        }
      }
      // Fallback: try html
      for (const part of parts) {
        const partCt = part.match(/Content-Type:\s*text\/html/i);
        if (partCt) {
          const bodyStart = part.indexOf('\n\n');
          if (bodyStart !== -1) {
            return stripHtml(decodeEmailBody(part.slice(bodyStart + 2).replace(/--$/, '').trim(), part));
          }
        }
      }
    }
  }

  // Simple: find double newline = body start
  const bodyStart = lines.indexOf('\n\n');
  if (bodyStart !== -1) {
    return decodeEmailBody(lines.slice(bodyStart + 2), lines);
  }
  return raw;
}

function getCharset(headers: string): string {
  const m = headers.match(/charset="?([^";\s\r\n]+)"?/i);
  return m?.[1]?.toLowerCase() ?? 'utf-8';
}

function decodeEmailBody(body: string, headers: string): string {
  const encodingMatch = headers.match(/Content-Transfer-Encoding:\s*(\S+)/i);
  const encoding = encodingMatch?.[1]?.toLowerCase();
  const charset = getCharset(headers);

  if (encoding === 'base64') {
    try {
      const buf = Buffer.from(body.replace(/\s/g, ''), 'base64');
      return new TextDecoder(charset).decode(buf);
    } catch { return body; }
  }
  if (encoding === 'quoted-printable') {
    const raw = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
    if (charset !== 'utf-8' && charset !== 'us-ascii') {
      try {
        const buf = Buffer.from(raw, 'binary');
        return new TextDecoder(charset).decode(buf);
      } catch { return raw; }
    }
    return raw;
  }
  // Plain — if non-utf8 charset, re-decode from latin1 bytes
  if (charset !== 'utf-8' && charset !== 'us-ascii') {
    try {
      const buf = Buffer.from(body, 'latin1');
      return new TextDecoder(charset).decode(buf);
    } catch { return body; }
  }
  return body;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
