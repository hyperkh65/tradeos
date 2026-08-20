import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { createNotification } from '@/lib/notifications';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC'
    ).all(id);
    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: taskId } = await params;
    const body = await req.json();
    const db = getDb();

    const commentId = newId();
    const ts = now();
    db.prepare(
      `INSERT INTO task_comments (id, task_id, user_id, user_name, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(commentId, taskId, user.id, user.name, body.content, ts);

    // @멘션 처리: @이름 패턴 감지 → 해당 팀원에게 알림
    const mentionPattern = /@(\S+)/g;
    const mentions = body.content?.match(mentionPattern) ?? [];
    if (mentions.length > 0) {
      // 멘션된 이름으로 사용자 조회
      const mentionedNames = mentions.map((m: string) => m.slice(1));
      for (const name of mentionedNames) {
        const mentionedUser = db.prepare(
          "SELECT id FROM users WHERE name = ? AND id != ?"
        ).get(name, user.id) as { id: string } | undefined;
        if (mentionedUser) {
          const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(taskId) as { title: string } | undefined;
          await createNotification({
            userIds: [mentionedUser.id],
            type: 'task_mention',
            title: `${user.name}님이 업무에서 회원님을 언급했습니다`,
            body: task ? `업무: ${task.title}` : undefined,
            link: `/tasks?id=${taskId}`,
            createdBy: user.id,
            createdByName: user.name,
          });
        }
      }
    }

    const row = db.prepare('SELECT * FROM task_comments WHERE id = ?').get(commentId);
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
