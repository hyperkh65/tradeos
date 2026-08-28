import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardApprovalDocRequest } from '@/lib/approval-doc/token';
import { rasterizePdfPage } from '@/lib/approval-doc/pdf-page';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents'
  : path.join(process.cwd(), 'data/uploads/approval-documents');

/** 특정 페이지를 미리보기용 PNG로 래스터화해 그대로 이미지 응답으로 돌려준다(화면의
 * 페이지 선택 썸네일에 <img src=이 경로>로 바로 쓸 수 있게). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string; page: string }> }) {
  const { token, sectionId, attachmentId, page } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const att = db.prepare('SELECT * FROM approval_doc_attachments WHERE id=? AND project_id=? AND section_id=?')
    .get(attachmentId, guard.project.id, sectionId) as Record<string, unknown> | undefined;
  if (!att) return NextResponse.json({ error: '없음' }, { status: 404 });

  const pageNum = parseInt(page, 10);
  if (!Number.isFinite(pageNum) || pageNum < 1) return NextResponse.json({ error: '잘못된 페이지 번호입니다.' }, { status: 400 });

  const filepath = path.join(UPLOAD_BASE, guard.project.id, attachmentId, String(att.stored_filename));
  const png = await rasterizePdfPage(filepath, pageNum, 100); // 미리보기는 저해상도로 빠르게
  if (!png) return NextResponse.json({ error: 'PDF 변환 서버를 사용할 수 없습니다.' }, { status: 503 });

  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' } });
}
