import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { encryptPassword } from '@/lib/mail/crypto';
import { PROVIDERS } from '@/lib/mail/providers';

// Auto-detect IMAP/SMTP server from email domain
function inferServers(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (domain === 'kakao.com') return { imap_host: 'imap.kakao.com', imap_port: 993, smtp_host: 'smtp.kakao.com', smtp_port: 465 };
  if (domain === 'daum.net' || domain === 'hanmail.net') return { imap_host: 'imap.daum.net', imap_port: 993, smtp_host: 'smtp.daum.net', smtp_port: 465 };
  if (domain === 'naver.com') return { imap_host: 'imap.naver.com', imap_port: 993, smtp_host: 'smtp.naver.com', smtp_port: 587 };
  if (domain === 'gmail.com') return { imap_host: 'imap.gmail.com', imap_port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 587 };
  return null;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, provider, label, email, from_email, imap_host, imap_port, smtp_host, smtp_port, created_at FROM mail_accounts WHERE user_id = ? ORDER BY created_at ASC'
  ).all(user.id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { provider = 'custom', email, password, from_email } = body;

  if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 });

  // Domain inference takes priority over provider preset
  const inferred = inferServers(email);
  const p = PROVIDERS[provider] ?? PROVIDERS.custom;

  const host = body.imap_host || inferred?.imap_host || p.imap_host;
  const port = Number(body.imap_port || inferred?.imap_port || p.imap_port);
  const smtpHost = body.smtp_host || inferred?.smtp_host || p.smtp_host;
  const smtpPort = Number(body.smtp_port || inferred?.smtp_port || p.smtp_port);

  if (!host) return NextResponse.json({ error: 'IMAP 서버를 입력하세요.' }, { status: 400 });

  try {
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host,
      port,
      secure: port === 993 || port === 465,
      auth: { user: email, pass: password },
      logger: false,
    });
    await client.connect();
    await client.logout();
  } catch (e) {
    const msg = (e as Error).message;
    const isAuthErr = msg.includes('Command failed') || msg.includes('Authentication failed')
      || msg.includes('Invalid credentials') || msg.includes('인증이 필요');
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    const isDaum = domain === 'daum.net' || domain === 'hanmail.net';
    let hint = '';
    if (isAuthErr) {
      if (isDaum) {
        hint = '\n\n다음/한메일 IMAP 인증 실패 해결 방법:\n① mail.daum.net → 설정 → POP3/IMAP → IMAP 사용 ON\n② 카카오 2단계 인증 사용 중이면 앱 비밀번호 발급 후 입력 (일반 비밀번호 X)';
      } else {
        hint = '\n비밀번호를 확인하거나, 메일 설정에서 IMAP을 허용했는지 확인하세요.';
      }
    }
    return NextResponse.json({ error: `연결 실패: ${msg}${hint}` }, { status: 400 });
  }

  const db = getDb();
  const id = newId();
  db.prepare(`
    INSERT INTO mail_accounts (id, user_id, provider, label, email, from_email, password_enc, imap_host, imap_port, smtp_host, smtp_port, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, user.id, provider, body.label || email, email, from_email || null, encryptPassword(password), host, port, smtpHost, smtpPort, now());

  const row = db.prepare(
    'SELECT id, provider, label, email, from_email, imap_host, imap_port, smtp_host, smtp_port, created_at FROM mail_accounts WHERE id = ?'
  ).get(id);
  return NextResponse.json(row, { status: 201 });
}
