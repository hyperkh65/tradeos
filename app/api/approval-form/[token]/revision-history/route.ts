import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardApprovalDocRequest, hashToken } from '@/lib/approval-doc/token';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, versionLabel: row.version_label, revisionDate: row.revision_date,
    noteOriginal: row.note_original, noteKorean: row.note_korean, tracedBy: row.traced_by, sortOrder: row.sort_order,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_doc_revision_history WHERE project_id=? ORDER BY sort_order').all(guard.project.id) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

interface RevisionRowInput {
  id?: string; versionLabel: string; revisionDate?: string | null;
  noteOriginal?: string | null; tracedBy?: string | null; sortOrder: number;
}

/** 행 자유 추가/삭제 지원 — 요청 배열에 없는 기존 행은 삭제한다(개정이력은 발주서 품목표
 * 같은 "제외 대신 실행 취소" 원칙이 적용되지 않는 단순 반복 표라서 전체교체가 적절함). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const projectId = guard.project.id;

  const body = await req.json();
  const items: RevisionRowInput[] = Array.isArray(body.rows) ? body.rows : [];

  const ts = now();
  db.transaction(() => {
    db.prepare('DELETE FROM approval_doc_revision_history WHERE project_id=?').run(projectId);
    const insert = db.prepare(`INSERT INTO approval_doc_revision_history
      (id, project_id, version_label, revision_date, note_original, note_korean, traced_by, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`);
    items.forEach((it, idx) => {
      insert.run(it.id || newId(), projectId, it.versionLabel, it.revisionDate ?? null, it.noteOriginal ?? null, it.tracedBy ?? null, idx, ts, ts);
    });
    db.prepare('UPDATE approval_doc_projects SET updated_at=? WHERE id=?').run(ts, projectId);
  })();

  writeApprovalAuditLog({
    projectId, action: 'draft_save', actorType: 'external', actorTokenHash: hashToken(token),
    after: { section: 'revision_history', rowCount: items.length }, req,
  });

  const rows = db.prepare('SELECT * FROM approval_doc_revision_history WHERE project_id=? ORDER BY sort_order').all(projectId) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}
