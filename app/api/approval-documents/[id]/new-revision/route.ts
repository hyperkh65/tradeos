import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';

/** A→B→C…→Z→AA 형태로 다음 개정번호를 계산한다(26개 넘어가는 경우까지 대비). */
function nextRevisionLabel(current: string): string {
  const letters = (current || 'A').toUpperCase().replace(/[^A-Z]/g, '') || 'A';
  const arr = letters.split('');
  let i = arr.length - 1;
  while (i >= 0) {
    if (arr[i] !== 'Z') { arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1); return arr.join(''); }
    arr[i] = 'A';
    i--;
  }
  return 'A' + arr.join('');
}

/**
 * 마감된 프로젝트를 새 개정본으로 이어간다 — 같은 프로젝트 행의 revision만 올리고
 * status를 다시 편집 가능 상태로 되돌린다(기존 링크·섹션 데이터는 그대로 이어받아 계속
 * 수정하는 구조 — 완전히 새 프로젝트를 만드는 게 아님). 개정이력 섹션에는 이번 개정의
 * "초안" 행을 자동으로 추가하되, 사용자가 나중에 실제 화면에서 확인·수정할 수 있게 한다
 * (요청서 §6 "자동 생성하되 사용자가 확인한 후 반영").
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status !== 'closed') return NextResponse.json({ error: '마감된 프로젝트만 새 개정본을 만들 수 있습니다.' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const newRevision = nextRevisionLabel(project.revision as string);
  const ts = now();

  db.transaction(() => {
    db.prepare(`UPDATE approval_doc_projects SET revision=?, status='editing', updated_at=? WHERE id=?`).run(newRevision, ts, id);
    const revisionSection = db.prepare(`SELECT id FROM approval_doc_sections WHERE project_id=? AND section_type='revision_history'`).get(id) as { id: string } | undefined;
    if (revisionSection) {
      const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_doc_revision_history WHERE project_id=?').get(id) as { m: number | null }).m ?? -1;
      db.prepare(`INSERT INTO approval_doc_revision_history (id, project_id, version_label, revision_date, note_original, traced_by, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        newId(), id, newRevision, ts.slice(0, 10), body.note || '(초안 — 변경 내용을 입력하세요)', user.name, maxOrder + 1, ts, ts,
      );
    }
  })();

  writeApprovalAuditLog({ projectId: id, action: 'new_revision', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req, after: { newRevision } });

  const row = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: { revision: row.revision, status: row.status } });
}
