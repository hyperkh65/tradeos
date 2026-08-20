import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function calcBusinessDays(start: string, end: string, isHalf: boolean): number {
  if (isHalf) return 0.5;
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (isBusinessDay(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function dbToLeave(row: Record<string, unknown>) {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    userName: row.user_name,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    days: row.days,
    reason: row.reason,
    status: row.status,
    approverId: row.approver_id,
    approverName: row.approver_name,
    approvedAt: row.approved_at,
    rejectReason: row.reject_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const year = searchParams.get('year') ?? String(new Date().getFullYear());

    let rows: Record<string, unknown>[];
    if (user.role === 'admin') {
      rows = db.prepare(
        `SELECT * FROM leave_requests WHERE substr(start_date,1,4) = ? ORDER BY created_at DESC`
      ).all(year) as Record<string, unknown>[];
    } else {
      rows = db.prepare(
        `SELECT * FROM leave_requests WHERE user_id = ? AND substr(start_date,1,4) = ? ORDER BY created_at DESC`
      ).all(user.id, year) as Record<string, unknown>[];
    }

    return NextResponse.json({ data: rows.map(dbToLeave) });
  } catch (err) {
    console.error('[leaves GET]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { leaveType, startDate, endDate, reason } = body;

    if (!leaveType || !startDate || !endDate) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 });
    }

    const isHalf = leaveType === 'half_am' || leaveType === 'half_pm';
    const days = body.days ?? calcBusinessDays(startDate, endDate, isHalf);

    const db = getDb();
    const id = newId();
    const businessId = nextBizId('LV');
    const ts = now();

    db.prepare(`
      INSERT INTO leave_requests (id, business_id, user_id, user_name, leave_type, start_date, end_date, days, reason, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, businessId, user.id, user.name, leaveType, startDate, endDate, days, reason ?? null, ts, ts);

    // 관리자(admin)에게 알림 생성
    try {
      const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all() as { id: string }[];
      const leaveTypeLabel: Record<string, string> = {
        annual: '연차', sick: '병가', half_am: '반차(오전)', half_pm: '반차(오후)', special: '특별휴가'
      };
      const typeLabel = leaveTypeLabel[leaveType] ?? leaveType;
      for (const admin of admins) {
        if (admin.id === user.id) continue;
        db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, link, is_read, created_by, created_by_name, created_at)
          VALUES (?, ?, 'approval_request', ?, ?, ?, 0, ?, ?, ?)
        `).run(
          newId(), admin.id,
          `휴가 신청: ${user.name}`,
          `${user.name}님이 ${typeLabel} (${startDate}~${endDate}, ${days}일)을 신청했습니다.`,
          `/approvals`,
          user.id, user.name, ts
        );
      }
    } catch (e) {
      console.error('[leaves POST] notification error', e);
    }

    // approvals 테이블에도 결재 요청 생성
    try {
      const leaveTypeLabel: Record<string, string> = {
        annual: '연차', sick: '병가', half_am: '반차(오전)', half_pm: '반차(오후)', special: '특별휴가'
      };
      const typeLabel = leaveTypeLabel[leaveType] ?? leaveType;
      const admins = db.prepare(`SELECT id, name FROM users WHERE role = 'admin' AND status = 'active'`).all() as { id: string; name: string }[];
      const steps = admins.map((a, i) => ({
        order: i + 1, approverId: a.id, approverName: a.name,
        role: '결재', status: '대기', comment: null, actedAt: null,
      }));
      const aprId = newId();
      const aprBizId = nextBizId('APR');
      db.prepare(`
        INSERT INTO approvals (id, business_id, form_type, form_title, requester_id, requester_name, requester_dept,
          steps_json, current_step, status, description, body_html, priority, due_date, related_json, tags_json, archived, created_at, updated_at)
        VALUES (?, ?, 'leave', ?, ?, ?, ?, ?, 1, '대기', ?, NULL, 'normal', ?, '[]', '[]', 0, ?, ?)
      `).run(
        aprId, aprBizId,
        `휴가 신청: ${user.name} ${startDate}~${endDate}`,
        user.id, user.name, user.department ?? null,
        JSON.stringify(steps),
        `${typeLabel} ${days}일 신청 (${reason ?? '사유 없음'})`,
        endDate,
        ts, ts
      );
    } catch (e) {
      console.error('[leaves POST] approval create error', e);
    }

    const created = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as Record<string, unknown>;
    return NextResponse.json({ data: dbToLeave(created) }, { status: 201 });
  } catch (err) {
    console.error('[leaves POST]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
