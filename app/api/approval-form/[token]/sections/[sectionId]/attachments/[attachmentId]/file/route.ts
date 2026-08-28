import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardApprovalDocRequest } from '@/lib/approval-doc/token';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents'
  : path.join(process.cwd(), 'data/uploads/approval-documents');

/** 원본 첨부파일 바이트를 그대로 서빙한다 — 자르기 도구가 항상 "가공되지 않은" 원본을
 * 배경으로 보여줘야 크롭 좌표가 매 편집마다 원본 기준으로 유지된다(edit/route.ts 주석 참고). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string }> }) {
  const { token, sectionId, attachmentId } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const attachment = db.prepare('SELECT * FROM approval_doc_attachments WHERE id=? AND project_id=? AND section_id=? AND is_current=1')
    .get(attachmentId, guard.project.id, sectionId) as Record<string, unknown> | undefined;
  if (!attachment) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });

  const filepath = path.join(UPLOAD_BASE, guard.project.id, attachmentId, String(attachment.stored_filename));
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '없음' }, { status: 404 });
  const ext = String(attachment.stored_filename).split('.').pop()?.toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'pdf' ? 'application/pdf' : 'application/octet-stream';
  return new NextResponse(new Uint8Array(fs.readFileSync(filepath)), { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300' } });
}
