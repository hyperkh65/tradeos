import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { fetchNotionTasks, createNotionTask } from '@/lib/notion/mapper';
import { DEMO_TASKS } from '@/lib/demo-data';

function dbToTask(row: Record<string, unknown>) {
  return {
    id: row.id, title: row.title, description: row.description||undefined,
    ownerId: row.owner_id, ownerName: row.owner_name, dueDate: row.due_date||undefined,
    priority: row.priority, status: row.status,
    relatedType: row.related_type||undefined, relatedId: row.related_id||undefined, relatedName: row.related_name||undefined,
    assigneeId: row.assignee_id||undefined, assigneeName: row.assignee_name||undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const assigneeParam = url.searchParams.get('assignee'); // 'all' | userId | undefined
    const db = getDb();

    const notionData = await fetchNotionTasks();
    if (notionData.length > 0) {
      const upsert = db.prepare(`INSERT OR REPLACE INTO tasks (id,title,description,owner_id,owner_name,due_date,priority,status,related_name,notion_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      db.transaction(() => {
        for (const t of notionData) {
          upsert.run(t.id,t.title,t.description??null,t.ownerId,t.ownerName,t.dueDate??null,t.priority,t.status,t.relatedName??null,t.id,t.createdAt,t.updatedAt);
        }
      })();
      return NextResponse.json({ data: notionData });
    }

    let rows: Record<string, unknown>[];
    if (assigneeParam === 'all') {
      rows = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Record<string, unknown>[];
    } else if (assigneeParam) {
      rows = db.prepare('SELECT * FROM tasks WHERE owner_id = ? OR assignee_id = ? ORDER BY created_at DESC').all(assigneeParam, assigneeParam) as Record<string, unknown>[];
    } else {
      rows = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Record<string, unknown>[];
    }
    if (rows.length > 0) return NextResponse.json({ data: rows.map(dbToTask) });

    // Seed
    const seed = db.prepare(`INSERT OR IGNORE INTO tasks (id,title,owner_id,owner_name,due_date,priority,status,related_type,related_id,related_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const t of DEMO_TASKS) {
        seed.run(t.id,t.title,t.ownerId,t.ownerName,t.dueDate??null,t.priority,t.status,t.relatedType??null,t.relatedId??null,t.relatedName??null,t.createdAt,t.updatedAt);
      }
    })();
    return NextResponse.json({ data: DEMO_TASKS });
  } catch (e) {
    return NextResponse.json({ data: DEMO_TASKS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const ts = now();
    const ownerId = user?.id || 'unknown';
    const ownerName = user?.name || '알 수 없음';

    const assigneeId = body.assigneeId ?? null;
    const assigneeName = body.assigneeName ?? null;

    db.prepare(`INSERT INTO tasks (id,title,description,owner_id,owner_name,due_date,priority,status,related_type,related_id,related_name,assignee_id,assignee_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,body.title,body.description??null,ownerId,ownerName,body.dueDate??null,body.priority||'medium',body.status||'해야 함',body.relatedType??null,body.relatedId??null,body.relatedName??null,assigneeId,assigneeName,ts,ts);

    createNotionTask({ ...body }).then(notionId => {
      if (notionId) db.prepare('UPDATE tasks SET notion_id=? WHERE id=?').run(notionId, id);
    }).catch(() => {});

    return NextResponse.json({ data: { id, ...body, ownerId, ownerName, createdAt:ts, updatedAt:ts } }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
