import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardSupplierRequest } from '@/lib/supplier-form/token';
import { writeAuditLog } from '@/lib/supplier-form/audit';
import { getSupplierFormSettings } from '@/lib/supplier-form/settings';
import { ATTACHMENT_CATEGORIES } from '@/lib/supplier-form/field-schema';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/supplier-requests'
  : path.join(process.cwd(), 'data/uploads/supplier-requests');

const PDF_MAGIC = Buffer.from('%PDF-');

function safeFilename(_original: string): string {
  return `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardSupplierRequest(token, true);
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

    if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다.', errorKey: 'no_file' }, { status: 400 });
    if (!categoryKey || !ATTACHMENT_CATEGORIES.some(c => c.key === categoryKey)) {
      return NextResponse.json({ error: '잘못된 첨부 항목입니다.', errorKey: 'invalid_category' }, { status: 400 });
    }

    const settings = getSupplierFormSettings();
    const maxBytes = settings.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: `파일 크기는 ${settings.maxFileSizeMb}MB 이하여야 합니다.`, errorKey: 'file_too_large' }, { status: 400 });
    }

    // 확장자 검사
    const extOk = /\.pdf$/i.test(file.name);
    // MIME 타입 검사
    const mimeOk = file.type === 'application/pdf' || file.type === '';
    // 매직바이트(%PDF-) 검사 — 확장자만 pdf로 바꾼 위장 파일 차단
    const headerBuf = Buffer.from(await file.slice(0, 5).arrayBuffer());
    const sigOk = headerBuf.equals(PDF_MAGIC);

    if (!extOk || !mimeOk || !sigOk) {
      return NextResponse.json({ error: 'PDF 파일만 업로드할 수 있습니다. (확장자·형식이 올바르지 않음)', errorKey: 'not_pdf' }, { status: 400 });
    }

    // 프로젝트 전체 용량 검사
    const db = getDb();
    const totalRow = db.prepare('SELECT COALESCE(SUM(size_bytes),0) as total FROM supplier_attachments WHERE project_id=? AND is_current=1')
      .get(project.id) as { total: number };
    const maxProjectBytes = settings.maxProjectTotalMb * 1024 * 1024;
    if (totalRow.total + file.size > maxProjectBytes) {
      return NextResponse.json({ error: `프로젝트 전체 첨부용량 한도(${settings.maxProjectTotalMb}MB)를 초과합니다.`, errorKey: 'project_quota_exceeded' }, { status: 400 });
    }

    const attachmentId = newId();
    const dir = path.join(UPLOAD_BASE, project.id, attachmentId);
    fs.mkdirSync(dir, { recursive: true });
    const storedFilename = safeFilename(file.name);
    filepath = path.join(dir, storedFilename);

    const nodeStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(nodeStream, fs.createWriteStream(filepath));

    const maxVersion = db.prepare('SELECT MAX(version) as v FROM supplier_attachments WHERE project_id=? AND category_key=?')
      .get(project.id, categoryKey) as { v: number | null };
    const ts = now();
    db.prepare(`INSERT INTO supplier_attachments
      (id, project_id, category_key, original_filename, stored_filename, size_bytes, mime_type, description,
       version, is_current, uploaded_by, uploaded_by_name, submission_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, 1, 'supplier', NULL, 0, ?)`).run(
      attachmentId, project.id, categoryKey, file.name, storedFilename, file.size, description,
      (maxVersion.v ?? 0) + 1, ts,
    );

    writeAuditLog({ projectId: project.id, action: 'file_upload', actorType: 'external', req, relatedAttachmentId: attachmentId, after: { categoryKey, filename: file.name, size: file.size } });

    return NextResponse.json({
      data: { id: attachmentId, categoryKey, originalFilename: file.name, sizeBytes: file.size, version: (maxVersion.v ?? 0) + 1, createdAt: ts },
    }, { status: 201 });
  } catch (e) {
    if (filepath) { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다. 다시 시도해주세요.', errorKey: 'upload_failed' }, { status: 500 });
  }
}
