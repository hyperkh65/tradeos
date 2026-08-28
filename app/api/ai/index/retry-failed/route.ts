import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/db/sqlite';
import { enqueueIndexJob, hasActiveJob } from '@/lib/ai/db';

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const db = getDb();
  const rows = db.prepare(`SELECT source_type, source_id FROM ai_document_index WHERE status='failed'`).all() as { source_type: string; source_id: string }[];
  let enqueued = 0;
  for (const r of rows) {
    if (hasActiveJob(r.source_type, r.source_id)) continue;
    enqueueIndexJob(r.source_type, r.source_id, 'update');
    enqueued++;
  }
  return NextResponse.json({ data: { enqueued, totalFailed: rows.length } });
}
