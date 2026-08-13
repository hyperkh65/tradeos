import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/inspections'
  : path.join(process.cwd(), 'data/uploads/inspections');

function safeExt(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
  return ext || 'bin';
}

function safeFilename(original: string): string {
  const ext = safeExt(original);
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let filepath = '';
  try {
    const { id } = await params;

    // Parse multipart form — streams the file to disk without loading all into memory
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: '멀티파트 요청만 지원합니다' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fileType = (formData.get('fileType') as string) || 'image';

    if (!file || file.size === 0) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    }

    const MAX_SIZE = 200 * 1024 * 1024; // 200MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '파일 크기는 200MB 이하로 업로드하세요' }, { status: 400 });
    }

    const subdir = fileType === 'report' ? 'reports' : 'images';
    const dir = path.join(UPLOAD_BASE, id, subdir);
    fs.mkdirSync(dir, { recursive: true });

    const filename = safeFilename(file.name);
    filepath = path.join(dir, filename);

    // Stream to disk to avoid loading large files into memory
    const webStream = file.stream();
    const nodeStream = Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);
    const writeStream = fs.createWriteStream(filepath);
    await pipeline(nodeStream, writeStream);

    const url = `/api/inspections/${id}/files/${subdir}_${filename}`;
    return NextResponse.json({
      url,
      filename,
      originalName: file.name,
      fileType,
      size: file.size,
    });
  } catch (e) {
    console.error('[inspection upload]', e);
    // Clean up partial file if it exists
    if (filepath) {
      try { fs.unlinkSync(filepath); } catch { /* ignore */ }
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
