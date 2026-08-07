import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { updateNotionPage, taskToNotion, archiveNotionPage } from '@/lib/notion/mapper';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const ts = now();

    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as Record<string,unknown>|undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    db.prepare(`UPDATE tasks SET title=?,description=?,due_date=?,priority=?,status=?,related_name=?,updated_at=? WHERE id=?`)
      .run(body.title??row.title, body.description??row.description, body.dueDate??row.due_date, body.priority??row.priority, body.status??row.status, body.relatedName??row.related_name, ts, id);

    if (row.notion_id) {
      updateNotionPage(row.notion_id as string, taskToNotion(body)).catch(() => {});
    }

    return NextResponse.json({ data: { ...row, ...body, updatedAt: ts } });
  } catch (e) {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT notion_id FROM tasks WHERE id=?').get(id) as { notion_id: string }|undefined;
    db.prepare('DELETE FROM tasks WHERE id=?').run(id);
    if (row?.notion_id) archiveNotionPage(row.notion_id).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
