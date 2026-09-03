import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, productId: row.product_id, compareItem: row.compare_item,
    judgement: row.judgement, changeLocation: row.change_location, beforeDesc: row.before_desc, afterDesc: row.after_desc,
    reason: row.reason, needsApproval: !!row.needs_approval, supplierExplanation: row.supplier_explanation,
    internalReviewOpinion: row.internal_review_opinion,
    relatedPhotoIds: JSON.parse((row.related_photo_ids_json as string) || '[]'),
    sortOrder: row.sort_order,
  };
}

/** §11 사전승인 대비 출고품 외관/부품 비교 — 출고선적승인서 스냅샷 생성 시
 * DIFF_COMPARE_ITEMS로 자동 시딩된 행만 존재한다(snapshot.ts). 사전승인서에는
 * 비교 대상 자체가 없으므로 이 라우트는 항상 빈 목록을 돌려준다. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  const rows = db.prepare('SELECT * FROM approval_inspection_diffs WHERE project_id=? AND product_id=? ORDER BY sort_order').all(id, productId) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

/** 표 전체 일괄 저장 — 차이가 있다고 표시한 행(judgement가 "동일"/"해당 없음"이 아님)은
 * §11 요구대로 변경위치·사유를 필수로 강제한다(값을 자동으로 채우지 않고 저장을 막기만 함). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });

  const body = await req.json().catch(() => ({}));
  const rows: Array<Record<string, unknown>> = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: 'rows 배열이 필요합니다.' }, { status: 400 });

  const incomplete: string[] = [];
  for (const r of rows) {
    const judgement = r.judgement as string | null | undefined;
    if (judgement && judgement !== '동일' && judgement !== '해당 없음') {
      if (!String(r.changeLocation ?? '').trim() || !String(r.reason ?? '').trim()) {
        incomplete.push(String(r.compareItem ?? r.id));
      }
    }
  }
  if (incomplete.length > 0) {
    return NextResponse.json({ error: `차이가 있다고 표시한 항목은 변경위치·사유를 입력해야 합니다: ${incomplete.join(', ')}` }, { status: 400 });
  }

  const EDITABLE_FIELDS: Record<string, string> = {
    judgement: 'judgement', changeLocation: 'change_location', beforeDesc: 'before_desc', afterDesc: 'after_desc',
    reason: 'reason', supplierExplanation: 'supplier_explanation', internalReviewOpinion: 'internal_review_opinion',
  };
  const ts = now();
  db.transaction(() => {
    for (const r of rows) {
      if (typeof r.id !== 'string') continue;
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, col] of Object.entries(EDITABLE_FIELDS)) {
        if (key in r) { sets.push(`${col}=?`); values.push(r[key] ?? null); }
      }
      if ('needsApproval' in r) { sets.push('needs_approval=?'); values.push(r.needsApproval ? 1 : 0); }
      if ('relatedPhotoIds' in r) { sets.push('related_photo_ids_json=?'); values.push(JSON.stringify(r.relatedPhotoIds ?? [])); }
      if (sets.length === 0) continue;
      sets.push('updated_at=?'); values.push(ts); values.push(r.id); values.push(productId);
      db.prepare(`UPDATE approval_inspection_diffs SET ${sets.join(', ')} WHERE id=? AND product_id=?`).run(...values);
    }
  })();

  writeInspectionAuditLog({ projectId: id, action: 'diff_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: { count: rows.length }, req });
  const out = db.prepare('SELECT * FROM approval_inspection_diffs WHERE product_id=? ORDER BY sort_order').all(productId) as Record<string, unknown>[];
  return NextResponse.json({ data: out.map(toClient) });
}
