import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardApprovalDocRequest, hashToken } from '@/lib/approval-doc/token';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { applyImageEdits } from '@/lib/approval-doc/image-edit';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents'
  : path.join(process.cwd(), 'data/uploads/approval-documents');

/**
 * 이미지 자르기/회전/배경정리 + 문서 삽입 마커 — 항상 원본(is_current=1인 attachments
 * 파일)에서 다시 시작해 적용하고, 결과물은 별도 파일(edited_file_path)로 저장한다.
 * 원본은 절대 덮어쓰지 않는다(요청서 §8 "원본 파일은 반드시 보존").
 *
 * PDF 페이지 삽입(insert-page)과 달리 이미지는 "페이지"가 없어 첨부당 활성 배치가
 * 하나뿐이다 — 그래서 매번 새 행을 추가하지 않고 (section_id, attachmentId,
 * source_pdf_page IS NULL) 하나의 행을 계속 갱신(upsert)한다. 편집 내용이 전혀
 * 없는 호출(rotationDeg/crop/bgRemove 모두 미지정)은 "그대로 문서에 삽입"만 표시하는
 * 마커로 취급해 sharp 연산 없이 배치 행만 만든다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string }> }) {
  const { token, sectionId, attachmentId } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();

  const attachment = db.prepare('SELECT * FROM approval_doc_attachments WHERE id=? AND project_id=? AND section_id=?')
    .get(attachmentId, guard.project.id, sectionId) as Record<string, unknown> | undefined;
  if (!attachment) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });

  const ext = String(attachment.stored_filename).split('.').pop()?.toLowerCase();
  if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
    return NextResponse.json({ error: '이미지 파일(PNG/JPG)만 편집할 수 있습니다.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const rotationDeg = [0, 90, 180, 270].includes(body.rotationDeg) ? body.rotationDeg : 0;
  const crop = body.crop && typeof body.crop.x === 'number' ? body.crop : undefined;
  const bgRemove = !!body.bgRemove;
  const hasEdit = !!rotationDeg || !!crop || bgRemove;

  const existing = db.prepare('SELECT * FROM approval_doc_image_placements WHERE section_id=? AND source_attachment_id=? AND source_pdf_page IS NULL')
    .get(sectionId, attachmentId) as Record<string, unknown> | undefined;

  let editedFilePath: string | null = null;
  if (hasEdit) {
    const originalPath = path.join(UPLOAD_BASE, guard.project.id, attachmentId, String(attachment.stored_filename));
    if (!fs.existsSync(originalPath)) return NextResponse.json({ error: '원본 파일이 서버에 없습니다.' }, { status: 500 });
    let editedBuf: Buffer;
    try {
      editedBuf = await applyImageEdits(fs.readFileSync(originalPath), { rotationDeg, crop, bgRemove });
    } catch (e) {
      return NextResponse.json({ error: `편집 실패: ${(e as Error).message}` }, { status: 400 });
    }
    const editedFileName = `edited_${Date.now()}.${bgRemove ? 'png' : ext}`;
    editedFilePath = path.join(UPLOAD_BASE, guard.project.id, attachmentId, editedFileName);
    fs.writeFileSync(editedFilePath, editedBuf);
  }
  // 이전 편집 결과 파일은 원본이 아니라 우리가 만든 파생물이므로 새 결과로 교체될 때 정리한다.
  if (existing?.edited_file_path) {
    try { fs.rmSync(String(existing.edited_file_path), { force: true }); } catch { /* ignore */ }
  }

  const ts = now();
  let placementId: string;
  if (existing) {
    placementId = String(existing.id);
    db.prepare(`UPDATE approval_doc_image_placements
      SET crop_rect_json=?, rotation_deg=?, bg_removed=?, edited_file_path=?, updated_at=? WHERE id=?`).run(
      crop ? JSON.stringify(crop) : null, rotationDeg, bgRemove ? 1 : 0, editedFilePath, ts, placementId,
    );
  } else {
    placementId = newId();
    db.prepare(`INSERT INTO approval_doc_image_placements
      (id, project_id, section_id, source_attachment_id, crop_rect_json, rotation_deg, bg_removed, edited_file_path, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'supplier', ?, ?)`).run(
      placementId, guard.project.id, sectionId, attachmentId,
      crop ? JSON.stringify(crop) : null, rotationDeg, bgRemove ? 1 : 0, editedFilePath, ts, ts,
    );
  }

  writeApprovalAuditLog({
    projectId: guard.project.id, action: 'file_replace', actorType: 'external', actorTokenHash: hashToken(token),
    req, relatedAttachmentId: attachmentId, after: { rotationDeg, crop, bgRemove },
  });

  return NextResponse.json({ data: { placementId, rotationDeg, crop: crop || null, bgRemove } }, { status: existing ? 200 : 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string }> }) {
  const { token, sectionId, attachmentId } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();

  const existing = db.prepare('SELECT * FROM approval_doc_image_placements WHERE section_id=? AND source_attachment_id=? AND source_pdf_page IS NULL')
    .get(sectionId, attachmentId) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ success: true });

  if (existing.edited_file_path) {
    try { fs.rmSync(String(existing.edited_file_path), { force: true }); } catch { /* ignore */ }
  }
  db.prepare('DELETE FROM approval_doc_image_placements WHERE id=?').run(existing.id);

  writeApprovalAuditLog({
    projectId: guard.project.id, action: 'file_delete', actorType: 'external', actorTokenHash: hashToken(token),
    req, relatedAttachmentId: attachmentId,
  });
  return NextResponse.json({ success: true });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string; attachmentId: string }> }) {
  const { token, sectionId, attachmentId } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const row = db.prepare('SELECT * FROM approval_doc_image_placements WHERE section_id=? AND source_attachment_id=? AND source_pdf_page IS NULL')
    .get(sectionId, attachmentId) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ data: null });
  return NextResponse.json({
    data: {
      placementId: row.id, rotationDeg: row.rotation_deg,
      cropRect: row.crop_rect_json ? JSON.parse(row.crop_rect_json as string) : null,
      bgRemoved: !!row.bg_removed, hasEditedFile: !!row.edited_file_path, updatedAt: row.updated_at,
    },
  });
}
