import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardApprovalDocRequest } from '@/lib/approval-doc/token';
import fs from 'fs';

/** 현재 적용된 편집 결과(자르기/회전/배경정리) 미리보기 — 편집이 없으면 404. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string }> }) {
  const { token, sectionId, attachmentId } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const row = db.prepare('SELECT * FROM approval_doc_image_placements WHERE section_id=? AND source_attachment_id=? AND source_pdf_page IS NULL')
    .get(sectionId, attachmentId) as Record<string, unknown> | undefined;
  if (!row?.edited_file_path || !fs.existsSync(String(row.edited_file_path))) {
    return NextResponse.json({ error: '편집된 결과가 없습니다.' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(fs.readFileSync(String(row.edited_file_path))), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60' } });
}
