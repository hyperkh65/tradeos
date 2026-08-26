import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/supplier-form/audit';
import type { TranslatableValue } from '@/lib/supplier-form/field-schema';

/** 내부 담당자가 공급업체 원문에 대응하는 한국어 확정값을 검토/수정한다. 마감된 프로젝트는 잠긴다. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const project = db.prepare('SELECT status FROM supplier_request_projects WHERE id=?').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });

  const body = await req.json().catch(() => null);
  if (!body?.key || typeof body.korean !== 'string') return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const response = db.prepare('SELECT * FROM supplier_form_responses WHERE project_id=?').get(id) as Record<string, unknown> | undefined;
  if (!response) return NextResponse.json({ error: '응답 데이터가 없습니다.' }, { status: 404 });

  const data: Record<string, TranslatableValue> = JSON.parse((response.data_json as string) || '{}');
  const before = data[body.key] ? { ...data[body.key] } : null;
  const existing = data[body.key];
  data[body.key] = {
    original: existing?.original ?? '',
    lang: existing?.lang ?? 'ko',
    korean: body.korean,
    translationStatus: 'confirmed',
    reviewed: true,
    updatedAt: now(),
  };

  db.prepare('UPDATE supplier_form_responses SET data_json=?, updated_at=? WHERE project_id=?').run(JSON.stringify(data), now(), id);

  writeAuditLog({
    projectId: id, action: 'korean_value_edit', actorType: 'internal', actorUserId: user.id, actorUserName: user.name,
    req, before, after: data[body.key],
  });

  return NextResponse.json({ data: data[body.key] });
}
