import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardApprovalDocRequest, hashToken } from '@/lib/approval-doc/token';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents'
  : path.join(process.cwd(), 'data/uploads/approval-documents');

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string }> }) {
  const { token, sectionId, attachmentId } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const row = db.prepare('SELECT * FROM approval_doc_attachments WHERE id=? AND project_id=? AND section_id=?')
    .get(attachmentId, guard.project.id, sectionId) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });

  db.prepare('UPDATE approval_doc_attachments SET is_current=0 WHERE id=?').run(attachmentId);
  try { fs.rmSync(path.join(UPLOAD_BASE, guard.project.id, attachmentId), { recursive: true, force: true }); } catch { /* ignore */ }

  writeApprovalAuditLog({
    projectId: guard.project.id, action: 'file_delete', actorType: 'external', actorTokenHash: hashToken(token),
    req, relatedAttachmentId: attachmentId, before: { filename: row.original_filename },
  });
  return NextResponse.json({ success: true });
}
