import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const rows = db.prepare('SELECT * FROM approval_inspection_audit_logs WHERE project_id=? ORDER BY created_at DESC LIMIT 200').all(id) as Record<string, unknown>[];
  return NextResponse.json({
    data: rows.map(r => ({
      id: r.id, action: r.action, actorType: r.actor_type, actorUserName: r.actor_user_name,
      submissionVersion: r.submission_version, createdAt: r.created_at,
    })),
  });
}
