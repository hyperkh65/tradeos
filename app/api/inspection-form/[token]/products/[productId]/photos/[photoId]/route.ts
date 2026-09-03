import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { UPLOAD_BASE } from '../route';
import fs from 'fs';
import path from 'path';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string; productId: string; photoId: string }> }) {
  const { token, productId, photoId } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();
  const before = db.prepare('SELECT * FROM approval_inspection_photos WHERE id=? AND product_id=? AND project_id=?').get(photoId, productId, project.id) as Record<string, unknown> | undefined;
  if (!before) return NextResponse.json({ error: '없음' }, { status: 404 });

  db.prepare('DELETE FROM approval_inspection_photos WHERE id=?').run(photoId);
  try { fs.rmSync(path.join(UPLOAD_BASE, project.id, photoId), { recursive: true, force: true }); } catch { /* ignore */ }

  writeInspectionAuditLog({ projectId: project.id, action: 'photo_delete', actorType: 'external', actorTokenHash: hashToken(token), before, req });
  return NextResponse.json({ ok: true });
}
