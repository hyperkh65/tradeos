import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const account = db.prepare(
    'SELECT * FROM mail_accounts WHERE id = ? AND user_id = ?'
  ).get(id, user.id) as Record<string, unknown> | undefined;
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { to, subject, body } = await req.json();
  if (!to || !subject) return NextResponse.json({ error: '받는 사람과 제목을 입력하세요.' }, { status: 400 });

  try {
    const nm = await import('nodemailer');
    const nodemailer = (nm.default ?? nm) as typeof import('nodemailer');
    const password = decryptPassword(account.password_enc as string);
    const smtpPort = account.smtp_port as number;

    const transport = nodemailer.createTransport({
      host: account.smtp_host as string,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: account.email as string, pass: password },
      tls: { rejectUnauthorized: false },
    });

    await transport.verify();
    await transport.sendMail({
      from: `"${user.name}" <${account.email}>`,
      to,
      subject,
      html: body || '',
      text: body?.replace(/<[^>]+>/g, '') || '',
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message || '알 수 없는 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
