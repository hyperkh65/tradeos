import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { nasUpload } from '@/lib/storage/nas';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const account = db.prepare(
    'SELECT id, email, label FROM mail_accounts WHERE id = ? AND user_id = ?'
  ).get(id, user.id) as { id: string; email: string; label: string } | undefined;
  if (!account) return NextResponse.json({ error: '계정 없음' }, { status: 404 });

  // 모든 폴더 메일 가져오기
  const mails = db.prepare(
    'SELECT * FROM mail_ext_messages WHERE account_id = ? ORDER BY date DESC'
  ).all(id) as Record<string, unknown>[];

  const backupData = {
    account: { email: account.email, label: account.label },
    exportedAt: new Date().toISOString(),
    totalCount: mails.length,
    mails,
  };

  const json = JSON.stringify(backupData, null, 2);
  const buf = Buffer.from(json, 'utf8');

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeEmail = account.email.replace(/[^a-zA-Z0-9@._-]/g, '_');
  const remotePath = `mail-backup/${safeEmail}_${dateStr}.json`;

  const result = await nasUpload(remotePath, buf, 'application/json');
  if (!result.success) {
    return NextResponse.json({ error: 'NAS 저장 실패: ' + result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: mails.length,
    path: result.path,
    size: Math.round(buf.length / 1024) + 'KB',
  });
}
