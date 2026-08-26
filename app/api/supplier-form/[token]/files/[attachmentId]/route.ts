import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardSupplierRequest } from '@/lib/supplier-form/token';
import { writeAuditLog } from '@/lib/supplier-form/audit';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/supplier-requests'
  : path.join(process.cwd(), 'data/uploads/supplier-requests');

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; attachmentId: string }> }) {
  const { token, attachmentId } = await params;
  // 다운로드/미리보기는 마감 상태에서도 허용 (열람은 계속 가능해야 함) — 매 요청마다 토큰+프로젝트 재검증
  const guard = guardSupplierRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const db = getDb();
  const att = db.prepare('SELECT * FROM supplier_attachments WHERE id=? AND project_id=?').get(attachmentId, project.id) as Record<string, unknown> | undefined;
  if (!att) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });

  const filepath = path.join(UPLOAD_BASE, project.id, attachmentId, att.stored_filename as string);
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '파일이 서버에 없습니다.' }, { status: 404 });

  const buf = fs.readFileSync(filepath);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.original_filename as string)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string; attachmentId: string }> }) {
  const { token, attachmentId } = await params;
  const guard = guardSupplierRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const db = getDb();
  const att = db.prepare('SELECT * FROM supplier_attachments WHERE id=? AND project_id=? AND is_current=1').get(attachmentId, project.id) as Record<string, unknown> | undefined;
  if (!att) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });

  // 물리 파일은 감사/이력 목적으로 남기고, 목록에서만 제외한다 (is_current=0)
  db.prepare('UPDATE supplier_attachments SET is_current=0 WHERE id=?').run(attachmentId);

  writeAuditLog({ projectId: project.id, action: 'file_delete', actorType: 'external', req, relatedAttachmentId: attachmentId, before: att });
  return NextResponse.json({ ok: true });
}
