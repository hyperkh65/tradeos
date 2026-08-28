import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';

/**
 * 교차검증에서 발견된 불일치를 내부 담당자가 "확인함"으로 표시한다 — 값을 자동으로
 * 고치는 기능이 아니라 사람이 검토했다는 사실만 기록하며(요청서 §7/§13 "자동으로 수정하지
 * 말고 확인을 받는다"), 이 확인 자체가 감사로그에 남는다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const issueKey = (body.issueKey || '').trim();
  if (!issueKey) return NextResponse.json({ error: 'issueKey가 필요합니다.' }, { status: 400 });

  const db = getDb();
  db.prepare(`INSERT INTO approval_doc_validation_acknowledgements (id, project_id, issue_key, acknowledged_by, acknowledged_by_name, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(newId(), id, issueKey, user.id, user.name, body.note ?? null, now());

  writeApprovalAuditLog({ projectId: id, action: 'validation_override', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req, after: { issueKey, note: body.note } });

  return NextResponse.json({ success: true });
}
