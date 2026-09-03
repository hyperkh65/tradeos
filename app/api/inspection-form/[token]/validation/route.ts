import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardInspectionFormRequest } from '@/lib/approval-inspection/token';
import { validateProject } from '@/lib/approval-inspection/validate';

/** 외부 작성자가 제출 전에 경고/오류를 확인할 수 있게 하는 조회 전용 엔드포인트 —
 * 확인(acknowledge) 처리는 내부 담당자만 할 수 있다(approval-doc과 동일 정책). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardInspectionFormRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const issues = validateProject(guard.project.id);
  const acked = new Set((db.prepare('SELECT issue_key FROM approval_inspection_validation_acknowledgements WHERE project_id=?').all(guard.project.id) as { issue_key: string }[]).map(r => r.issue_key));
  return NextResponse.json({ data: issues.map(i => ({ ...i, acknowledged: acked.has(i.key) })) });
}
