import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const year = new Date().getFullYear();
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId') ?? user.id;

    // 현재 유저가 admin이 아니라면 본인 정보만
    const effectiveUserId = user.role === 'admin' ? targetUserId : user.id;

    // 연차 정책 조회 (없으면 기본값)
    let policy = db.prepare('SELECT * FROM leave_policies WHERE user_id = ?').get(effectiveUserId) as Record<string, unknown> | undefined;
    if (!policy) {
      // 유저 이름 조회
      const u = db.prepare('SELECT name FROM users WHERE id = ?').get(effectiveUserId) as { name: string } | undefined;
      policy = {
        id: null,
        user_id: effectiveUserId,
        user_name: u?.name ?? user.name,
        annual_days: 15,
        year,
      };
    }

    // 올해 사용 연차 계산 (approved + annual/sick 등)
    const usedRows = db.prepare(`
      SELECT days, leave_type FROM leave_requests
      WHERE user_id = ? AND status = 'approved' AND substr(start_date,1,4) = ?
    `).all(effectiveUserId, String(year)) as { days: number; leave_type: string }[];

    const usedDays = usedRows.reduce((sum, r) => sum + (r.days ?? 0), 0);
    const annualDays = (policy.annual_days as number) ?? 15;
    const remainingDays = Math.max(0, annualDays - usedDays);

    // admin이면 전체 팀원 정책 목록도 포함
    let teamPolicies: unknown[] | undefined;
    if (user.role === 'admin') {
      const users = db.prepare(`SELECT id, name FROM users WHERE status = 'active' ORDER BY name ASC`).all() as { id: string; name: string }[];
      teamPolicies = users.map(u => {
        const p = db.prepare('SELECT * FROM leave_policies WHERE user_id = ?').get(u.id) as Record<string, unknown> | undefined;
        const usedR = db.prepare(`
          SELECT days FROM leave_requests WHERE user_id = ? AND status = 'approved' AND substr(start_date,1,4) = ?
        `).all(u.id, String(year)) as { days: number }[];
        const used = usedR.reduce((s, r) => s + r.days, 0);
        const total = (p?.annual_days as number) ?? 15;
        return {
          userId: u.id,
          userName: u.name,
          annualDays: total,
          usedDays: used,
          remainingDays: Math.max(0, total - used),
          year,
          policyId: p?.id ?? null,
        };
      });
    }

    return NextResponse.json({
      data: {
        userId: effectiveUserId,
        userName: policy.user_name,
        annualDays,
        usedDays,
        remainingDays,
        year,
        teamPolicies,
      }
    });
  } catch (err) {
    console.error('[leaves/policy GET]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 수정할 수 있습니다.' }, { status: 403 });

    const body = await req.json();
    const { userId, annualDays } = body;
    if (!userId || annualDays == null) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });

    const db = getDb();
    const year = new Date().getFullYear();
    const ts = now();

    const existing = db.prepare('SELECT id FROM leave_policies WHERE user_id = ?').get(userId) as { id: string } | undefined;
    const targetUser = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string } | undefined;

    if (existing) {
      db.prepare('UPDATE leave_policies SET annual_days = ?, year = ?, updated_at = ? WHERE user_id = ?')
        .run(annualDays, year, ts, userId);
    } else {
      db.prepare(`
        INSERT INTO leave_policies (id, user_id, user_name, annual_days, year, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(newId(), userId, targetUser?.name ?? userId, annualDays, year, ts, ts);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[leaves/policy PUT]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
