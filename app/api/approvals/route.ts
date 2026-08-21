import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { createNotionApproval, fetchNotionApprovals } from '@/lib/notion/mapper';

function genBusinessId(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `APR-${year}-${rand}`;
}

// SQLite에 없는(=유실된) 결재문서를 Notion에서 찾아 뼈대만 복구한다.
// 결재선(steps_json)은 Notion에 없어서 복구되지 않으므로, 라이브 워크플로우와 섞이지
// 않도록 보관함(archived)으로만 되살린다. 로컬에 이미 있는 문서는 절대 덮어쓰지 않는다.
async function restoreMissingFromNotion(db: ReturnType<typeof getDb>) {
  let notionApprovals;
  try {
    notionApprovals = await fetchNotionApprovals();
  } catch {
    return;
  }
  if (!notionApprovals.length) return;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO approvals (id, business_id, form_type, form_title, requester_id, requester_name, requester_dept,
      steps_json, current_step, status, description, priority, due_date, related_json, tags_json, archived, notion_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, '', ?, NULL, '[]', 1, ?, ?, ?, ?, '[]', '[]', 1, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const a of notionApprovals) {
      const existing = db.prepare('SELECT id FROM approvals WHERE business_id = ? OR notion_id = ?').get(a.businessId, a.notionId);
      if (existing) continue;
      const createdAt = a.createdAt || now();
      insert.run(
        newId(), a.businessId, a.formType, a.formTitle || '(제목 없음)',
        a.requesterName || '알 수 없음', a.status, a.description || null,
        a.priority, a.dueDate || null, a.notionId, createdAt, createdAt
      );
    }
  })();
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    await restoreMissingFromNotion(db);
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab') ?? 'mine';

    let rows: unknown[];
    if (tab === 'pending') {
      const all = db.prepare('SELECT * FROM approvals WHERE archived = 0 ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
      rows = all.filter(a => {
        try {
          const steps = JSON.parse(a.steps_json as string) as Array<{ approverId: string; status: string; order: number }>;
          const myStep = steps.find(s => s.approverId === user.id && s.status === '대기');
          if (!myStep) return false;
          return steps.filter(s => s.order < myStep.order).every(s => s.status === '승인');
        } catch { return false; }
      });
    } else if (tab === 'done') {
      const all = db.prepare('SELECT * FROM approvals WHERE archived = 0 ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
      rows = all.filter(a => {
        try {
          const steps = JSON.parse(a.steps_json as string) as Array<{ approverId: string; status: string }>;
          return steps.some(s => s.approverId === user.id && (s.status === '승인' || s.status === '반려'));
        } catch { return false; }
      });
    } else if (tab === 'archive') {
      rows = db.prepare('SELECT * FROM approvals WHERE archived = 1 ORDER BY updated_at DESC').all();
    } else {
      // mine: 내가 기안한 것 (임시저장 포함)
      rows = db.prepare('SELECT * FROM approvals WHERE requester_id = ? AND archived = 0 ORDER BY created_at DESC').all(user.id);
    }
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const db = getDb();
    const id = newId();
    const business_id = genBusinessId();
    const createdAt = now();
    const steps = (body.steps ?? []).map((s: { approverId: string; approverName: string; role?: string }, i: number) => ({
      order: i + 1, approverId: s.approverId, approverName: s.approverName,
      role: s.role ?? '결재', status: '대기', comment: null, actedAt: null,
    }));

    const initStatus = body.draft ? '임시저장' : '대기';
    const notionId = await createNotionApproval({
      businessId: business_id,
      formType: body.form_type ?? '일반',
      formTitle: body.form_title,
      requesterName: user.name,
      requesterDept: body.requester_dept ?? null,
      status: initStatus,
      priority: body.priority ?? 'normal',
      dueDate: body.due_date ?? null,
      description: body.description ?? null,
    }).catch(() => null);
    db.prepare(`
      INSERT INTO approvals (id, business_id, form_type, form_title, requester_id, requester_name, requester_dept,
        steps_json, current_step, status, description, body_html, priority, due_date, related_json, tags_json, archived, notion_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id, business_id, body.form_type ?? '일반', body.form_title,
      user.id, user.name, body.requester_dept ?? null,
      JSON.stringify(steps), initStatus,
      body.description ?? null, body.body_html ?? null,
      body.priority ?? 'normal', body.due_date ?? null,
      JSON.stringify(body.related ?? []), JSON.stringify(body.tags ?? []),
      notionId, createdAt, createdAt
    );
    return NextResponse.json(db.prepare('SELECT * FROM approvals WHERE id = ?').get(id), { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
