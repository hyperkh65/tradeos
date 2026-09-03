import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { PHOTO_CATEGORIES } from '@/lib/approval-inspection/types';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

export const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-inspection'
  : path.join(process.cwd(), 'data/uploads/approval-inspection');

const MAGIC: Record<string, Buffer> = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  jpg: Buffer.from([0xff, 0xd8, 0xff]),
};

function detectKind(ext: string): 'png' | 'jpg' | 'other' {
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  return 'other';
}

function safeFilename(original: string): string {
  const ext = (original.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`;
}

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, productId: row.product_id, sampleId: row.sample_id,
    categoryKey: row.category_key, originalFilename: row.original_filename,
    sizeBytes: row.size_bytes, mimeType: row.mime_type, description: row.description,
    cropRect: row.crop_rect_json ? JSON.parse(row.crop_rect_json as string) : null,
    rotationDeg: row.rotation_deg, hasEditedFile: !!row.edited_file_path,
    sortOrder: row.sort_order, createdAt: row.created_at,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  const rows = db.prepare('SELECT * FROM approval_inspection_photos WHERE project_id=? AND product_id=? AND is_current=1 ORDER BY category_key, sort_order')
    .all(id, productId) as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

/** §9 사진 업로드 — 카테고리별로 최신본(is_current=1)만 남기고 이전 버전은
 * is_current=0으로 내려서 실수로 덮어써도 이력이 사라지지 않게 한다(approval-doc
 * attachments와 동일한 패턴). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });
  const product = db.prepare('SELECT id FROM approval_inspection_products WHERE id=? AND project_id=? AND deleted=0').get(productId, id);
  if (!product) return NextResponse.json({ error: '없음' }, { status: 404 });

  let filepath = '';
  try {
    if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json({ error: '멀티파트 요청만 지원합니다.' }, { status: 400 });
    }
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const categoryKey = formData.get('categoryKey') as string | null;
    const description = (formData.get('description') as string | null) || null;
    if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    if (!categoryKey || !PHOTO_CATEGORIES.some(c => c.key === categoryKey)) {
      return NextResponse.json({ error: '올바른 사진 구분(categoryKey)이 필요합니다.' }, { status: 400 });
    }
    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) return NextResponse.json({ error: '파일 크기는 20MB 이하여야 합니다.' }, { status: 400 });

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const kind = detectKind(ext);
    if (kind === 'other') return NextResponse.json({ error: '사진 파일(PNG/JPG)만 업로드할 수 있습니다.' }, { status: 400 });
    const headerBuf = Buffer.from(await file.slice(0, 8).arrayBuffer());
    if (!headerBuf.subarray(0, MAGIC[kind].length).equals(MAGIC[kind])) {
      return NextResponse.json({ error: '파일 형식이 확장자와 일치하지 않습니다.' }, { status: 400 });
    }

    const photoId = newId();
    const dir = path.join(UPLOAD_BASE, id, photoId);
    fs.mkdirSync(dir, { recursive: true });
    const storedFilename = safeFilename(file.name);
    filepath = path.join(dir, storedFilename);
    const nodeStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(nodeStream, fs.createWriteStream(filepath));

    const ts = now();
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_inspection_photos WHERE product_id=? AND category_key=?').get(productId, categoryKey) as { m: number | null }).m;
    const maxVersion = (db.prepare('SELECT MAX(version) as v FROM approval_inspection_photos WHERE product_id=? AND category_key=?').get(productId, categoryKey) as { v: number | null }).v;

    db.transaction(() => {
      db.prepare('UPDATE approval_inspection_photos SET is_current=0 WHERE product_id=? AND category_key=?').run(productId, categoryKey);
      db.prepare(`INSERT INTO approval_inspection_photos
        (id, project_id, product_id, category_key, original_filename, stored_filename, size_bytes, mime_type, description,
         version, is_current, sort_order, uploaded_by, uploaded_by_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`).run(
        photoId, id, productId, categoryKey, file.name, storedFilename, file.size, file.type || null, description,
        (maxVersion ?? 0) + 1, (maxOrder ?? -1) + 1, user.id, user.name, ts,
      );
    })();

    writeInspectionAuditLog({ projectId: id, action: 'photo_upload', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: { categoryKey, filename: file.name, size: file.size }, req });

    const row = db.prepare('SELECT * FROM approval_inspection_photos WHERE id=?').get(photoId) as Record<string, unknown>;
    return NextResponse.json({ data: toClient(row) }, { status: 201 });
  } catch {
    if (filepath) { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
