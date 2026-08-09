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

function createTransport(account: Record<string, unknown>, password: string) {
  const smtpPort = account.smtp_port as number;
  return nodemailer.createTransport({
    host: account.smtp_host as string,
    port: smtpPort,
    secure: smtpPort === 465,
    ...(smtpPort === 587 ? { requireTLS: true } : {}),
    auth: { user: account.email as string, pass: password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
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

  // Accept both FormData and JSON
  const ct = req.headers.get('content-type') ?? '';
  let to = '', cc = '', bcc = '', subject = '', body = '', scheduledAt = '';
  const attachFiles: File[] = [];

  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    const fd = await req.formData();
    to = (fd.get('to') as string) ?? '';
    cc = (fd.get('cc') as string) ?? '';
    bcc = (fd.get('bcc') as string) ?? '';
    subject = (fd.get('subject') as string) ?? '';
    body = (fd.get('body') as string) ?? '';
    scheduledAt = (fd.get('scheduled_at') as string) ?? '';
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

  // Save attachment files
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

  // If scheduled for the future, store in DB
  if (scheduledAt) {
    const schedDate = new Date(scheduledAt);
    if (!isNaN(schedDate.getTime()) && schedDate > new Date()) {
      const sid = newId();
      db.prepare(`
        INSERT INTO scheduled_ext_mails (id, account_id, user_id, to_addr, cc, bcc, subject, body_html, attach_paths_json, scheduled_at, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(sid, id, user.id, to, cc, bcc, subject, body, JSON.stringify(savedPaths), schedDate.toISOString(), now());
      return NextResponse.json({ scheduled: true, scheduled_at: schedDate.toISOString() });
    }
  }

  // Send immediately
  try {
    const password = decryptPassword(account.password_enc as string);
    const transport = createTransport(account, password);

    const attachments = savedPaths.map(p => ({
      filename: p.original,
      path: path.join(scheduledDir, p.filename),
      contentType: p.mime,
    }));

    await transport.sendMail({
      from: `"${user.name}" <${account.email}>`,
      to,
      ...(cc ? { cc } : {}),
      ...(bcc ? { bcc } : {}),
      subject,
      html: body || '',
      text: body?.replace(/<[^>]+>/g, '') || '',
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message || '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
