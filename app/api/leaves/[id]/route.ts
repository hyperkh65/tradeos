import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!leave) return NextResponse.json({ error: '휴가 신청을 찾을 수 없습니다.' }, { status: 404 });

    const body = await req.json();
    const { action, rejectReason } = body;
    const ts = now();

    const isAdmin = user.role === 'admin';
    const isApprover = (user as { role: string }).role === 'approver' || isAdmin;
    const isOwner = leave.user_id === user.id;

    if (action === 'cancel') {
      if (!isOwner) return NextResponse.json({ error: '본인 신청만 취소할 수 있습니다.' }, { status: 403 });
      if (leave.status !== 'pending') return NextResponse.json({ error: '대기 중인 신청만 취소할 수 있습니다.' }, { status: 400 });

      db.prepare(`UPDATE leave_requests SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(ts, id);

    } else if (action === 'approve') {
      if (!isApprover) return NextResponse.json({ error: '승인 권한이 없습니다.' }, { status: 403 });
      if (leave.status !== 'pending') return NextResponse.json({ error: '대기 중인 신청만 승인할 수 있습니다.' }, { status: 400 });

      db.prepare(`
        UPDATE leave_requests SET status = 'approved', approver_id = ?, approver_name = ?, approved_at = ?, updated_at = ? WHERE id = ?
      `).run(user.id, user.name, ts, ts, id);

      // 신청자에게 승인 알림
      try {
        db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, link, is_read, created_by, created_by_name, created_at)
          VALUES (?, ?, 'approval_result', ?, ?, ?, 0, ?, ?, ?)
        `).run(
          newId(), leave.user_id as string,
          '휴가 신청 승인',
          `${user.name}님이 휴가 신청(${leave.start_date}~${leave.end_date})을 승인했습니다.`,
          '/hr',
          user.id, user.name, ts
        );
      } catch (e) {
        console.error('[leaves PATCH] notification error', e);
      }

    } else if (action === 'reject') {
      if (!isApprover) return NextResponse.json({ error: '반려 권한이 없습니다.' }, { status: 403 });
      if (leave.status !== 'pending') return NextResponse.json({ error: '대기 중인 신청만 반려할 수 있습니다.' }, { status: 400 });

      db.prepare(`
        UPDATE leave_requests SET status = 'rejected', approver_id = ?, approver_name = ?, approved_at = ?, reject_reason = ?, updated_at = ? WHERE id = ?
      `).run(user.id, user.name, ts, rejectReason ?? null, ts, id);

      // 신청자에게 반려 알림
      try {
        db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, link, is_read, created_by, created_by_name, created_at)
          VALUES (?, ?, 'approval_result', ?, ?, ?, 0, ?, ?, ?)
        `).run(
          newId(), leave.user_id as string,
          '휴가 신청 반려',
          `${user.name}님이 휴가 신청(${leave.start_date}~${leave.end_date})을 반려했습니다. ${rejectReason ? `사유: ${rejectReason}` : ''}`,
          '/hr',
          user.id, user.name, ts
        );
      } catch (e) {
        console.error('[leaves PATCH] notification error', e);
      }

    } else {
      return NextResponse.json({ error: '잘못된 action입니다.' }, { status: 400 });
    }

    const updated = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id) as Record<string, unknown>;
    return NextResponse.json({
      data: {
        id: updated.id,
        businessId: updated.business_id,
        userId: updated.user_id,
        userName: updated.user_name,
        leaveType: updated.leave_type,
        startDate: updated.start_date,
        endDate: updated.end_date,
        days: updated.days,
        reason: updated.reason,
        status: updated.status,
        approverId: updated.approver_id,
        approverName: updated.approver_name,
        approvedAt: updated.approved_at,
        rejectReason: updated.reject_reason,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      }
    });
  } catch (err) {
    console.error('[leaves/[id] PATCH]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
