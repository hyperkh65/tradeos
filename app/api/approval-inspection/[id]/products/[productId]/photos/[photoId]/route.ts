import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { UPLOAD_BASE } from '@/lib/approval-inspection/storage';
import fs from 'fs';
import path from 'path';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string; photoId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId, photoId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });
  const before = db.prepare('SELECT * FROM approval_inspection_photos WHERE id=? AND product_id=? AND project_id=?').get(photoId, productId, id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  db.prepare('DELETE FROM approval_inspection_photos WHERE id=?').run(photoId);
  try { fs.rmSync(path.join(UPLOAD_BASE, id, photoId), { recursive: true, force: true }); } catch { /* ignore */ }

  writeInspectionAuditLog({ projectId: id, action: 'photo_delete', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, before, req });
  return NextResponse.json({ ok: true });
}
