import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

/** 대화방을 물리적으로 지우지 않고 상태만 'deleted'로 바꾼다 — 메시지/파일도 전혀
 * 건드리지 않는다. 관리자는 채널 목록/메시지 조회 모두에서 삭제된 대화방을 계속
 * 볼 수 있어야 하므로(감사 목적), 실제 데이터를 지우면 이 요구를 만족할 수 없다. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const channel = db.prepare('SELECT * FROM channels WHERE id=?').get(id) as { id: string; created_by: string; status: string } | undefined;
    if (!channel) return NextResponse.json({ error: '대화방을 찾을 수 없습니다.' }, { status: 404 });
    if (channel.status === 'deleted') return NextResponse.json({ error: '이미 삭제된 대화방입니다.' }, { status: 400 });
    if (user.role !== 'admin' && channel.created_by !== user.id) {
      return NextResponse.json({ error: '대화방을 만든 사람 또는 관리자만 삭제할 수 있습니다.' }, { status: 403 });
    }

    db.prepare(`UPDATE channels SET status='deleted', deleted_at=?, deleted_by=? WHERE id=?`).run(now(), user.id, id);
    const row = db.prepare('SELECT * FROM channels WHERE id=?').get(id);
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
