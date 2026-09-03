import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string; sampleId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId, sampleId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });
  const sample = db.prepare('SELECT id FROM approval_inspection_samples WHERE id=? AND product_id=? AND project_id=?').get(sampleId, productId, id);
  if (!sample) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const rows: Array<Record<string, unknown>> = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: 'rows 배열이 필요합니다.' }, { status: 400 });

  const update = db.prepare('UPDATE approval_inspection_sample_measurements SET measured_value=?, unit=?, judgement=? WHERE id=? AND sample_id=?');
  db.transaction(() => {
    for (const r of rows) {
      if (typeof r.id !== 'string') continue;
      update.run(r.measuredValue ?? null, r.unit ?? null, r.judgement ?? null, r.id, sampleId);
    }
  })();

  writeInspectionAuditLog({ projectId: id, action: 'sample_update', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: { sampleId, count: rows.length }, req });
  const out = db.prepare('SELECT * FROM approval_inspection_sample_measurements WHERE sample_id=?').all(sampleId) as Record<string, unknown>[];
  return NextResponse.json({ data: out.map(r => ({ id: r.id, itemKey: r.item_key, itemLabel: r.item_label, measuredValue: r.measured_value, unit: r.unit, judgement: r.judgement })) });
}
