import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardInspectionFormRequest, hashToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { applyImageEdits } from '@/lib/approval-doc/image-edit';
import { UPLOAD_BASE } from '../../route';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; productId: string; photoId: string }> }) {
  const { token, productId, photoId } = await params;
  const guard = guardInspectionFormRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;
  const db = getDb();
  const photo = db.prepare('SELECT * FROM approval_inspection_photos WHERE id=? AND project_id=? AND product_id=?')
    .get(photoId, project.id, productId) as Record<string, unknown> | undefined;
  if (!photo) return NextResponse.json({ error: '없음' }, { status: 404 });

  const ext = String(photo.stored_filename).split('.').pop()?.toLowerCase();
  if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
    return NextResponse.json({ error: '이미지 파일(PNG/JPG)만 편집할 수 있습니다.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const rotationDeg = [0, 90, 180, 270].includes(body.rotationDeg) ? body.rotationDeg : 0;
  const crop = body.crop && typeof body.crop.x === 'number' ? body.crop : undefined;
  const hasEdit = !!rotationDeg || !!crop;

  const originalPath = path.join(UPLOAD_BASE, project.id, photoId, String(photo.stored_filename));
  let editedFilePath: string | null = null;
  if (hasEdit) {
    if (!fs.existsSync(originalPath)) return NextResponse.json({ error: '원본 파일이 서버에 없습니다.' }, { status: 500 });
    let editedBuf: Buffer;
    try {
      editedBuf = await applyImageEdits(fs.readFileSync(originalPath), { rotationDeg, crop });
    } catch (e) {
      return NextResponse.json({ error: `편집 실패: ${(e as Error).message}` }, { status: 400 });
    }
    editedFilePath = path.join(UPLOAD_BASE, project.id, photoId, `edited_${Date.now()}.${ext}`);
    fs.writeFileSync(editedFilePath, editedBuf);
  }
  if (photo.edited_file_path) {
    try { fs.rmSync(String(photo.edited_file_path), { force: true }); } catch { /* ignore */ }
  }

  db.prepare('UPDATE approval_inspection_photos SET crop_rect_json=?, rotation_deg=?, edited_file_path=? WHERE id=?').run(
    crop ? JSON.stringify(crop) : null, rotationDeg, editedFilePath, photoId,
  );

  writeInspectionAuditLog({ projectId: project.id, action: 'photo_edit', actorType: 'external', actorTokenHash: hashToken(token), after: { rotationDeg, crop }, req });
  return NextResponse.json({ data: { rotationDeg, crop: crop || null, hasEditedFile: !!editedFilePath } });
}
