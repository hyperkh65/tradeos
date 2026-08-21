import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads'
    : path.join(process.cwd(), 'data', 'uploads'));

function makeTransport(host: string, port: number, email: string, password: string) {
  const isSSL = port === 465 || port === 994;
  return nodemailer.createTransport({
    host,
    port,
    secure: isSSL,
    ...(isSSL ? {} : { requireTLS: false, opportunisticTLS: true }),
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false, minVersion: 'TLSv1' as 'TLSv1' },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000,
  } as Parameters<typeof nodemailer.createTransport>[0]);
}

function friendlySmtpError(e: Error & { code?: string; response?: string; responseCode?: number }): string {
  const msg = e.message || '';
  const code = e.code || '';
  const resp = e.response || '';
  if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) return 'SMTP 서버 연결 거부 — 포트가 방화벽에 막혀있거나 서버 주소가 잘못됐습니다';
  if (code === 'ETIMEDOUT' || msg.includes('timeout') || msg.includes('ETIMEDOUT')) return 'SMTP 연결 시간 초과 — ISP가 SMTP 포트(465/587)를 차단했을 수 있습니다';
  if (code === 'ENOTFOUND' || msg.includes('ENOTFOUND')) return `SMTP 서버를 찾을 수 없습니다 — 서버 주소를 확인하세요`;
  if (msg.includes('인증') || resp.includes('535') || resp.includes('534') || resp.includes('Username and Password') || msg.includes('Invalid credentials') || msg.includes('Authentication')) return `SMTP 인증 실패 — 비밀번호가 틀렸거나 앱 비밀번호가 필요합니다 (${resp || msg})`;
  if (resp.includes('550') || msg.includes('550')) return `발신 주소 거부 — 이 SMTP 서버에서 허용되지 않는 발신 주소입니다 (${resp})`;
  return `${msg}${resp ? ` (${resp})` : ''}`;
}

async function sendWithFallback(
  account: Record<string, unknown>,
  password: string,
  mailOpts: Parameters<ReturnType<typeof nodemailer.createTransport>['sendMail']>[0],
) {
  const host = String(account.smtp_host);
  const primaryPort = Number(account.smtp_port);
  // 포트 폴백: 587 실패 시 465, 465 실패 시 587
  const fallbackPort = primaryPort === 587 ? 465 : 587;
  const ports = [primaryPort, fallbackPort];

  let lastError: Error = new Error('SMTP 연결 실패');
  for (const port of ports) {
    try {
      const t = makeTransport(host, port, String(account.email), password);
      await t.sendMail(mailOpts);
      return { port }; // 성공한 포트 반환
    } catch (e) {
      lastError = e as Error;
      const msg = lastError.message ?? '';
      // 소켓 오류나 연결 오류면 폴백 시도, 인증 오류면 바로 실패
      const isConnErr = msg.includes('socket') || msg.includes('connect') || msg.includes('ECONNREFUSED') || msg.includes('timeout');
      if (!isConnErr) throw lastError;
    }
  }
  throw lastError;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const account = db.prepare(
    'SELECT * FROM mail_accounts WHERE id = ? AND user_id = ?'
  ).get(id, user.id) as Record<string, unknown> | undefined;
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ct = req.headers.get('content-type') ?? '';
  let to = '', cc = '', bcc = '', subject = '', body = '', scheduledAt = '';
  const attachFiles: File[] = [];

  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    const fd = await req.formData();
    to = String(fd.get('to') ?? '');
    cc = String(fd.get('cc') ?? '');
    bcc = String(fd.get('bcc') ?? '');
    subject = String(fd.get('subject') ?? '');
    body = String(fd.get('body') ?? '');
    scheduledAt = String(fd.get('scheduled_at') ?? '');
    for (const [, v] of fd.entries()) {
      if (v instanceof File && v.size > 0) attachFiles.push(v);
    }
  } else {
    const j = await req.json();
    to = j.to ?? ''; cc = j.cc ?? ''; bcc = j.bcc ?? '';
    subject = j.subject ?? ''; body = j.body ?? '';
    scheduledAt = j.scheduled_at ?? '';
  }

  if (!to || !subject) return NextResponse.json({ error: '받는 사람과 제목을 입력하세요.' }, { status: 400 });

  // Save attachment files to disk
  const scheduledDir = path.join(UPLOAD_DIR, 'scheduled');
  const savedPaths: { filename: string; original: string; mime: string }[] = [];
  if (attachFiles.length > 0) {
    fs.mkdirSync(scheduledDir, { recursive: true });
    for (const f of attachFiles) {
      const ext = path.extname(f.name);
      const fname = `${newId()}${ext}`;
      fs.writeFileSync(path.join(scheduledDir, fname), Buffer.from(await f.arrayBuffer()));
      savedPaths.push({ filename: fname, original: f.name, mime: f.type });
    }
  }

  // Schedule for future
  if (scheduledAt && scheduledAt !== 'undefined') {
    const schedDate = new Date(scheduledAt);
    if (!isNaN(schedDate.getTime()) && schedDate > new Date()) {
      const sid = newId();
      db.prepare(`
        INSERT INTO scheduled_ext_mails
          (id, account_id, user_id, to_addr, cc, bcc, subject, body_html, attach_paths_json, scheduled_at, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(sid, id, user.id, to, cc, bcc, subject, body, JSON.stringify(savedPaths), schedDate.toISOString(), now());
      return NextResponse.json({ scheduled: true, scheduled_at: schedDate.toISOString() });
    }
  }

  // Send immediately
  try {
    let password: string;
    try { password = decryptPassword(account.password_enc as string); } catch {
      return NextResponse.json({ error: '비밀번호 복호화 실패 - 메일 계정을 삭제하고 다시 등록해주세요.' }, { status: 400 });
    }

    const attachments = savedPaths.map(p => ({
      filename: p.original,
      path: path.join(scheduledDir, p.filename),
      contentType: p.mime,
    }));

    const authAddr = String(account.email);
    const customAddr = account.from_email ? String(account.from_email) : null;
    const displayFrom = customAddr || authAddr;

    const buildOpts = (fromAddr: string) => ({
      from: `"${user.name}" <${fromAddr}>`,
      to,
      ...(cc && cc !== 'undefined' ? { cc } : {}),
      ...(bcc && bcc !== 'undefined' ? { bcc } : {}),
      subject,
      html: body || '',
      text: (body || '').replace(/<[^>]+>/g, ''),
      attachments,
    });

    // 전략 1: from_email로 직접 SMTP 인증 + From 주소 사용 (Daum 스마트워크)
    // 전략 2: auth 계정으로 인증 + from_email을 From에 사용
    // 전략 3: auth 계정으로 인증 + auth 계정을 From에 사용
    let result: { port: number };
    let usedFrom = displayFrom;

    const accountWithCustomAuth = customAddr ? { ...account, email: customAddr } : null;

    if (customAddr && customAddr !== authAddr) {
      try {
        // 전략 1: from_email 주소로 직접 인증
        result = await sendWithFallback(accountWithCustomAuth!, password, buildOpts(customAddr));
      } catch {
        try {
          // 전략 2: auth 계정으로 인증하되 from_email을 From으로
          result = await sendWithFallback(account, password, buildOpts(customAddr));
        } catch {
          // 전략 3: auth 계정으로 인증 + auth 계정 From
          result = await sendWithFallback(account, password, buildOpts(authAddr));
          usedFrom = authAddr;
        }
      }
    } else {
      result = await sendWithFallback(account, password, buildOpts(authAddr));
    }

    // ── IMAP APPEND: 서버 Sent 폴더에 복사 ──────────────────────────────
    // 일반 메일 클라이언트처럼 발송 후 IMAP Sent 폴더에 업로드해야 다음/gmail 앱에서 보임
    const sentId = newId();
    const recipients = [to, ...(cc && cc !== 'undefined' ? [cc] : []), ...(bcc && bcc !== 'undefined' ? [bcc] : [])];
    let savedUid = `local_${sentId}`;

    try {
      // nodemailer MailComposer로 raw RFC 2822 메시지 생성
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const MailComposer = require('nodemailer/lib/mail-composer');
      const finalOpts = buildOpts(usedFrom);
      const rawMsg: Buffer = await new Promise((resolve, reject) => {
        new MailComposer(finalOpts).compile().build((err: Error | null, buf: Buffer) => {
          if (err) reject(err); else resolve(buf);
        });
      });

      const { ImapFlow } = await import('imapflow');
      const imapPort = Number(account.imap_port);
      const imap = new ImapFlow({
        host: String(account.imap_host),
        port: imapPort,
        secure: imapPort === 993,
        auth: { user: String(account.email), pass: password },
        logger: false,
        tls: { rejectUnauthorized: false },
      });
      await imap.connect();

      const SENT_NAMES = [
        'Sent', 'INBOX.Sent', '보낸편지함', '보낸 편지함', '보낸메일함',
        'Sent Items', '[Gmail]/Sent Mail', 'sent',
      ];
      let sentFolder: string | null = null;
      for (const name of SENT_NAMES) {
        try { await imap.mailboxOpen(name); sentFolder = name; break; } catch { /* try next */ }
      }

      if (sentFolder) {
        const appendResult = await imap.append(sentFolder, rawMsg, ['\\Seen'], new Date());
        const ar = appendResult as false | { uid?: number };
        if (ar && ar.uid) {
          savedUid = `s_${ar.uid}`; // 실제 서버 UID 사용 → sync 중복 없음
        }
      }
      await imap.logout();
    } catch (appendErr) {
      console.warn('[send] IMAP append 실패 (local 저장으로 대체):', (appendErr as Error).message);
    }

    // DB에 보낸 메일 저장 (IMAP append 성공 시 서버 UID, 실패 시 local_ UID)
    try {
      db.prepare(`
        INSERT OR IGNORE INTO mail_ext_messages
          (id, account_id, uid, from_name, from_email, to_json, subject, body_text, date, is_read, is_starred, folder, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'sent', ?)
      `).run(sentId, id, savedUid, user.name, usedFrom,
        JSON.stringify(recipients.map((r: string) => r.trim()).filter(Boolean)),
        subject, body || '', new Date().toISOString(), now());
    } catch { /* non-critical */ }

    return NextResponse.json({ ok: true, port: result.port, from: usedFrom });
  } catch (e) {
    const err = e as Error & { code?: string; response?: string; responseCode?: number };
    const host = String(account.smtp_host);
    console.error(`SMTP error [${host}:${account.smtp_port}]`, err.code, err.message, err.response);
    return NextResponse.json(
      { error: friendlySmtpError(err) },
      { status: 500 }
    );
  }
}
