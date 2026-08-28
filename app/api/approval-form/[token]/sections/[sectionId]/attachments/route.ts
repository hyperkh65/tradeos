import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardApprovalDocRequest, hashToken } from '@/lib/approval-doc/token';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { getApprovalDocSettings } from '@/lib/approval-doc/settings';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import sharp from 'sharp';

export const maxDuration = 120;

// 요청서 §8 "제품 이미지 도움말"·§12 권장 해상도 — 제품 사진은 가로 2000px 이상, 회로도/PCB
// 등 도면류는 글자 판독 가능성이 더 중요해 요구치를 조금 낮춘다. 저해상도라고 업로드 자체를
// 막지는 않고(요청서: 업로드는 허용, 경고만) 응답에 warning으로 실어 화면에 안내한다.
const MIN_WIDTH_BY_SECTION: Record<string, number> = { optical: 2000 };
const DEFAULT_MIN_WIDTH = 1200;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents'
  : path.join(process.cwd(), 'data/uploads/approval-documents');

const MAGIC: Record<string, Buffer> = {
  pdf: Buffer.from('%PDF-'),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  jpg: Buffer.from([0xff, 0xd8, 0xff]),
};

function detectKind(ext: string): 'pdf' | 'png' | 'jpg' | 'other' {
  if (ext === 'pdf') return 'pdf';
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  return 'other';
}

function safeFilename(original: string): string {
  const ext = (original.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string }> }) {
  const { token, sectionId } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM approval_doc_attachments WHERE project_id=? AND section_id=? AND is_current=1 ORDER BY category_key, created_at`)
    .all(guard.project.id, sectionId) as Record<string, unknown>[];
  return NextResponse.json({
    data: rows.map(a => ({
      id: a.id, categoryKey: a.category_key, originalFilename: a.original_filename,
      sizeBytes: a.size_bytes, mimeType: a.mime_type, description: a.description, createdAt: a.created_at,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string }> }) {
  const { token, sectionId } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

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
    if (!categoryKey) return NextResponse.json({ error: '자료 구분(categoryKey)이 필요합니다.' }, { status: 400 });

    const settings = getApprovalDocSettings();
    const maxBytes = settings.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) return NextResponse.json({ error: `파일 크기는 ${settings.maxFileSizeMb}MB 이하여야 합니다.` }, { status: 400 });

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const kind = detectKind(ext);
    if (kind !== 'other') {
      const headerBuf = Buffer.from(await file.slice(0, 8).arrayBuffer());
      const magic = MAGIC[kind];
      if (!headerBuf.subarray(0, magic.length).equals(magic)) {
        return NextResponse.json({ error: '파일 형식이 확장자와 일치하지 않습니다.' }, { status: 400 });
      }
    }

    const db = getDb();
    const totalRow = db.prepare('SELECT COALESCE(SUM(size_bytes),0) as total FROM approval_doc_attachments WHERE project_id=? AND is_current=1')
      .get(project.id) as { total: number };
    if (totalRow.total + file.size > settings.maxProjectTotalMb * 1024 * 1024) {
      return NextResponse.json({ error: `프로젝트 전체 첨부용량 한도(${settings.maxProjectTotalMb}MB)를 초과합니다.` }, { status: 400 });
    }

    const attachmentId = newId();
    const dir = path.join(UPLOAD_BASE, project.id, attachmentId);
    fs.mkdirSync(dir, { recursive: true });
    const storedFilename = safeFilename(file.name);
    filepath = path.join(dir, storedFilename);
    const nodeStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(nodeStream, fs.createWriteStream(filepath));

    const maxVersion = db.prepare('SELECT MAX(version) as v FROM approval_doc_attachments WHERE project_id=? AND category_key=?')
      .get(project.id, categoryKey) as { v: number | null };
    const ts = now();
    db.prepare(`INSERT INTO approval_doc_attachments
      (id, project_id, section_id, category_key, original_filename, stored_filename, size_bytes, mime_type, description,
       version, is_current, uploaded_by, uploaded_by_name, submission_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'supplier', NULL, 0, ?)`).run(
      attachmentId, project.id, sectionId, categoryKey, file.name, storedFilename, file.size, file.type || null, description,
      (maxVersion.v ?? 0) + 1, ts,
    );

    writeApprovalAuditLog({
      projectId: project.id, action: 'file_upload', actorType: 'external', actorTokenHash: hashToken(token),
      req, relatedAttachmentId: attachmentId, after: { categoryKey, filename: file.name, size: file.size },
    });

    let warning: string | null = null;
    if (kind === 'png' || kind === 'jpg') {
      try {
        const meta = await sharp(filepath).metadata();
        const sectionType = (db.prepare('SELECT section_type FROM approval_doc_sections WHERE id=?').get(sectionId) as { section_type: string } | undefined)?.section_type;
        const minWidth = (sectionType && MIN_WIDTH_BY_SECTION[sectionType]) || DEFAULT_MIN_WIDTH;
        if (meta.width && meta.width < minWidth) {
          warning = `인쇄 품질을 위해 가로 ${minWidth}px 이상의 고해상도 이미지를 권장합니다. (업로드된 이미지: ${meta.width}×${meta.height}px)`;
        }
      } catch { /* 해상도 확인 실패는 업로드 자체를 막지 않는다 */ }
    }

    return NextResponse.json({ data: { id: attachmentId, categoryKey, originalFilename: file.name, sizeBytes: file.size, createdAt: ts, warning } }, { status: 201 });
  } catch {
    if (filepath) { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
