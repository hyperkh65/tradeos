import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardApprovalDocRequest, hashToken } from '@/lib/approval-doc/token';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';

/** 첨부 PDF의 특정 페이지를 "승인서 본문에 이미지로 삽입"할지 지정한다 — 여러 페이지를
 * 동시에 넣을 수 있으므로(요청서: "여러 페이지를 연속 삽입") 페이지별로 독립된
 * approval_doc_image_placements 행을 둔다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string }> }) {
  const { token, sectionId, attachmentId } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const att = db.prepare('SELECT id FROM approval_doc_attachments WHERE id=? AND project_id=? AND section_id=?')
    .get(attachmentId, guard.project.id, sectionId);
  if (!att) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json();
  const page = Number(body.page);
  if (!Number.isFinite(page) || page < 1) return NextResponse.json({ error: '잘못된 페이지 번호입니다.' }, { status: 400 });

  const existing = db.prepare('SELECT id FROM approval_doc_image_placements WHERE source_attachment_id=? AND source_pdf_page=?').get(attachmentId, page);
  if (existing) return NextResponse.json({ error: '이미 삽입 지정된 페이지입니다.' }, { status: 409 });

  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_doc_image_placements WHERE section_id=?').get(sectionId) as { m: number | null }).m ?? -1;
  const ts = now();
  db.prepare(`INSERT INTO approval_doc_image_placements
    (id, project_id, section_id, source_attachment_id, source_pdf_page, rotation_deg, bg_removed, caption_original, sort_order, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 'supplier', ?, ?)`).run(
    newId(), guard.project.id, sectionId, attachmentId, page, body.caption ?? null, maxOrder + 1, ts, ts,
  );

  writeApprovalAuditLog({ projectId: guard.project.id, action: 'draft_save', actorType: 'external', actorTokenHash: hashToken(token), req, after: { sectionId, attachmentId, page } });
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string }> }) {
  const { token, sectionId, attachmentId } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const page = Number(new URL(req.url).searchParams.get('page'));
  if (!Number.isFinite(page)) return NextResponse.json({ error: '잘못된 페이지 번호입니다.' }, { status: 400 });
  db.prepare('DELETE FROM approval_doc_image_placements WHERE source_attachment_id=? AND source_pdf_page=? AND section_id=?').run(attachmentId, page, sectionId);
  return NextResponse.json({ success: true });
}
