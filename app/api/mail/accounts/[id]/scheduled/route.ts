import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads'
    : path.join(process.cwd(), 'data', 'uploads'));

// GET: list scheduled mails for this account
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM scheduled_ext_mails WHERE account_id = ? AND user_id = ? AND status = 'pending' ORDER BY scheduled_at ASC"
  ).all(id, user.id);
  return NextResponse.json(rows);
}

// POST: trigger processing of due scheduled mails
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const db = getDb();

  const account = db.prepare('SELECT * FROM mail_accounts WHERE id = ? AND user_id = ?').get(id, user.id) as Record<string, unknown> | undefined;
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const due = db.prepare(
    "SELECT * FROM scheduled_ext_mails WHERE account_id = ? AND user_id = ? AND status = 'pending' AND scheduled_at <= ?"
  ).all(id, user.id, new Date().toISOString()) as Array<Record<string, unknown>>;

  let sent = 0;
  for (const mail of due) {
    try {
      const password = decryptPassword(account.password_enc as string);
      const smtpPort = Number(account.smtp_port);
      const isSSL = smtpPort === 465 || smtpPort === 994;
      const transport = nodemailer.createTransport({
        host: String(account.smtp_host),
        port: smtpPort,
        secure: isSSL,
        ...(isSSL ? {} : { requireTLS: true }),
        auth: { user: String(account.email), pass: password },
        tls: { rejectUnauthorized: false, minVersion: 'TLSv1' as 'TLSv1' },
        connectionTimeout: 25000,
        greetingTimeout: 25000,
        socketTimeout: 35000,
      } as Parameters<typeof nodemailer.createTransport>[0]);

      const attachPaths: Array<{ filename: string; original: string; mime: string }> = JSON.parse(mail.attach_paths_json as string);
      const attachments = attachPaths
        .map(p => ({ filename: p.original, path: path.join(UPLOAD_DIR, 'scheduled', p.filename), contentType: p.mime }))
        .filter(a => fs.existsSync(a.path));

      await transport.sendMail({
        from: `"${user.name}" <${account.email}>`,
        to: mail.to_addr as string,
        ...(mail.cc ? { cc: mail.cc as string } : {}),
        ...(mail.bcc ? { bcc: mail.bcc as string } : {}),
        subject: mail.subject as string,
        html: (mail.body_html as string) || '',
        text: ((mail.body_html as string) || '').replace(/<[^>]+>/g, ''),
        attachments,
      });

      db.prepare("UPDATE scheduled_ext_mails SET status = 'sent', error_msg = NULL WHERE id = ?").run(mail.id);
      sent++;
    } catch (e) {
      db.prepare("UPDATE scheduled_ext_mails SET status = 'error', error_msg = ? WHERE id = ?").run((e as Error).message, mail.id);
    }
  }
  return NextResponse.json({ processed: due.length, sent });
}

// DELETE: cancel a scheduled mail
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: accountId } = await params;
  const { mailId } = await req.json();
  const db = getDb();
  const row = db.prepare('SELECT * FROM scheduled_ext_mails WHERE id = ? AND account_id = ? AND user_id = ?').get(mailId, accountId, user.id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  db.prepare("UPDATE scheduled_ext_mails SET status = 'cancelled' WHERE id = ?").run(mailId);
  // Clean up files
  try {
    const paths: Array<{ filename: string }> = JSON.parse(row.attach_paths_json as string);
    paths.forEach(p => {
      const fp = path.join(UPLOAD_DIR, 'scheduled', p.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: true });
}

// Update scheduled time
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: accountId } = await params;
  const { mailId, scheduledAt } = await req.json();
  const db = getDb();
  db.prepare("UPDATE scheduled_ext_mails SET scheduled_at = ?, error_msg = NULL WHERE id = ? AND account_id = ? AND user_id = ?").run(scheduledAt, mailId, accountId, user.id);
  return NextResponse.json({ ok: true, now: now() });
}
