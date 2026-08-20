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
    connectionTimeout: 25000,
    greetingTimeout: 25000,
    socketTimeout: 35000,
  } as Parameters<typeof nodemailer.createTransport>[0]);
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

    const fromAddr = account.from_email ? String(account.from_email) : String(account.email);
    const authAddr = String(account.email);
    const mailOpts = {
      to,
      ...(cc && cc !== 'undefined' ? { cc } : {}),
      ...(bcc && bcc !== 'undefined' ? { bcc } : {}),
      subject,
      html: body || '',
      text: (body || '').replace(/<[^>]+>/g, ''),
      attachments,
    };

    let result: { port: number };
    let usedFrom = fromAddr;
    try {
      result = await sendWithFallback(account, password, { from: `"${user.name}" <${fromAddr}>`, ...mailOpts });
    } catch (e1) {
      // from_email이 SMTP에서 거부된 경우 auth 이메일로 재시도
      if (fromAddr !== authAddr) {
        result = await sendWithFallback(account, password, { from: `"${user.name}" <${authAddr}>`, ...mailOpts });
        usedFrom = authAddr;
      } else {
        throw e1;
      }
    }

    // Save to sent folder in DB
    try {
      const sentId = newId();
      const recipients = [to, ...(cc && cc !== 'undefined' ? [cc] : []), ...(bcc && bcc !== 'undefined' ? [bcc] : [])];
      db.prepare(`
        INSERT OR IGNORE INTO mail_ext_messages
          (id, account_id, uid, from_name, from_email, to_json, subject, body_text, date, is_read, is_starred, folder, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'sent', ?)
      `).run(sentId, id, `local_${sentId}`, user.name, usedFrom,
        JSON.stringify(recipients.map(r => r.trim()).filter(Boolean)),
        subject, body || '', new Date().toISOString(), now());
    } catch { /* non-critical */ }

    return NextResponse.json({ ok: true, port: result.port, from: usedFrom });
  } catch (e) {
    const err = e as Error & { code?: string; response?: string };
    const detail = err.response ?? err.code ?? '';
    const msg = err.message || '알 수 없는 오류';
    const host = String(account.smtp_host);
    console.error(`SMTP error [${host}]`, msg, detail);
    return NextResponse.json(
      { error: `${msg}${detail ? ` (${detail})` : ''}` },
      { status: 500 }
    );
  }
}
