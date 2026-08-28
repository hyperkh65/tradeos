import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardApprovalDocRequest } from '@/lib/approval-doc/token';
import { getPdfPageCount } from '@/lib/approval-doc/pdf-page';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents'
  : path.join(process.cwd(), 'data/uploads/approval-documents');

/** 첨부 PDF의 총 페이지 수를 반환한다 — 화면이 "몇 페이지 중 몇 페이지를 넣을지" 선택
 * UI를 그리는 데 사용. 이미 삽입 지정된 페이지가 있으면 함께 알려준다. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string }> }) {
  const { token, sectionId, attachmentId } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const att = db.prepare('SELECT * FROM approval_doc_attachments WHERE id=? AND project_id=? AND section_id=?')
    .get(attachmentId, guard.project.id, sectionId) as Record<string, unknown> | undefined;
  if (!att) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (!String(att.original_filename).toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'PDF 파일이 아닙니다.' }, { status: 400 });
  }

  const filepath = path.join(UPLOAD_BASE, guard.project.id, attachmentId, String(att.stored_filename));
  let pageCount = 0;
  try {
    pageCount = await getPdfPageCount(filepath);
  } catch (e) {
    return NextResponse.json({ error: `PDF 페이지 수를 읽을 수 없습니다: ${(e as Error).message}` }, { status: 500 });
  }

  const insertedPages = db.prepare('SELECT source_pdf_page FROM approval_doc_image_placements WHERE source_attachment_id=? AND source_pdf_page IS NOT NULL')
    .all(attachmentId) as { source_pdf_page: number }[];

  return NextResponse.json({ data: { pageCount, insertedPages: insertedPages.map(r => r.source_pdf_page) } });
}
