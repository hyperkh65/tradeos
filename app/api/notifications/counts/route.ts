import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();

    // 결재 대기 (내 차례인 것)
    const allApprovals = db.prepare(
      'SELECT steps_json FROM approvals WHERE archived = 0 AND status NOT IN (?,?)'
    ).all('임시저장', '승인') as Array<{ steps_json: string }>;
    const pendingApprovals = allApprovals.filter(a => {
      try {
        const steps = JSON.parse(a.steps_json) as Array<{ approverId: string; status: string; order: number }>;
        const myStep = steps.find(s => s.approverId === user.id && s.status === '대기');
        if (!myStep) return false;
        return steps.filter(s => s.order < myStep.order).every(s => s.status === '승인');
      } catch { return false; }
    });

    // 외부 메일 미읽음
    let unreadMail = 0;
    try {
      const r = db.prepare(
        `SELECT COUNT(*) as n FROM mail_ext_messages m
         JOIN mail_accounts a ON m.account_id = a.id
         WHERE a.user_id = ? AND m.is_read = 0`
      ).get(user.id) as { n: number } | undefined;
      unreadMail = r?.n ?? 0;
    } catch { /* mail tables may not exist */ }

    // 내부 메일 미읽음
    let unreadInternalMail = 0;
    try {
      const mails = db.prepare('SELECT read_by_json, receiver_ids_json FROM mail').all() as Array<{ read_by_json: string; receiver_ids_json: string }>;
      unreadInternalMail = mails.filter(m => {
        try {
          const receivers: string[] = JSON.parse(m.receiver_ids_json);
          const readBy: string[] = JSON.parse(m.read_by_json);
          return receivers.includes(user.id) && !readBy.includes(user.id);
        } catch { return false; }
      }).length;
    } catch { /* ignore */ }

    // 메신저: 내가 속한 채널의 미읽음 알림 (DB에 last_seen 없으므로 notifications 테이블 사용)
    let unreadMessenger = 0;
    try {
      const r = db.prepare(
        `SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND is_read = 0 AND type = 'message'`
      ).get(user.id) as { n: number } | undefined;
      unreadMessenger = r?.n ?? 0;
    } catch { /* ignore */ }

    return NextResponse.json({
      approvals: pendingApprovals.length,
      mail: unreadMail + unreadInternalMail,
      messenger: unreadMessenger,
    });
  } catch (e) {
    console.error('[counts]', e);
    return NextResponse.json({ approvals: 0, mail: 0, messenger: 0 });
  }
}
