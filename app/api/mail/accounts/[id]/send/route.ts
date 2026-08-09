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

function buildTransport(account: Record<string, unknown>, password: string) {
  const smtpPort = Number(account.smtp_port); // Number() 로 명시적 변환 (string '465' 대비)
  const isSSL = smtpPort === 465 || smtpPort === 994;

  return nodemailer.createTransport({
    host: String(account.smtp_host),
    port: smtpPort,
    secure: isSSL,
    ...(isSSL ? {} : { requireTLS: true }),
    auth: {
      user: String(account.email),
      pass: password,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1' as 'TLSv1',
    },
    connectionTimeout: 25000,
    greetingTimeout: 25000,
    socketTimeout: 35000,
  } as Parameters<typeof nodemailer.createTransport>[0]);
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
    const password = decryptPassword(account.password_enc as string);
    const transport = buildTransport(account, password);

    const attachments = savedPaths.map(p => ({
      filename: p.original,
      path: path.join(scheduledDir, p.filename),
      contentType: p.mime,
    }));

    await transport.sendMail({
      from: `"${user.name}" <${String(account.email)}>`,
      to,
      ...(cc && cc !== 'undefined' ? { cc } : {}),
      ...(bcc && bcc !== 'undefined' ? { bcc } : {}),
      subject,
      html: body || '',
      text: (body || '').replace(/<[^>]+>/g, ''),
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { code?: string; response?: string };
    const detail = err.response ?? err.code ?? '';
    const msg = err.message || '알 수 없는 오류';
    const host = String(account.smtp_host);
    const port = Number(account.smtp_port);
    console.error(`SMTP error [${host}:${port}]`, msg, detail);
    return NextResponse.json(
      { error: `${msg}${detail ? ` (${detail})` : ''} — 서버: ${host}:${port}` },
      { status: 500 }
    );
  }
}
