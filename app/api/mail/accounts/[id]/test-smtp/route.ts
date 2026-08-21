import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { decryptPassword } from '@/lib/mail/crypto';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const account = db.prepare(
    'SELECT * FROM mail_accounts WHERE id = ? AND user_id = ?'
  ).get(id, user.id) as Record<string, unknown> | undefined;
  if (!account) return NextResponse.json({ error: '계정 없음' }, { status: 404 });

  let password: string;
  try { password = decryptPassword(account.password_enc as string); } catch {
    return NextResponse.json({ error: '비밀번호 복호화 실패' }, { status: 400 });
  }

  const host = String(account.smtp_host);
  const primaryPort = Number(account.smtp_port);
  const ports = [primaryPort, primaryPort === 465 ? 587 : 465];
  const results: { port: number; ok: boolean; error?: string }[] = [];

  for (const port of ports) {
    const isSSL = port === 465 || port === 994;
    const transport = nodemailer.createTransport({
      host, port,
      secure: isSSL,
      auth: { user: String(account.email), pass: password },
      tls: { rejectUnauthorized: false, minVersion: 'TLSv1' as 'TLSv1' },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    } as Parameters<typeof nodemailer.createTransport>[0]);

    try {
      await transport.verify();
      results.push({ port, ok: true });
    } catch (e) {
      results.push({ port, ok: false, error: (e as Error).message });
    }
  }

  const success = results.find(r => r.ok);
  return NextResponse.json({ results, working_port: success?.port ?? null });
}
