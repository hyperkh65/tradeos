import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/inspections'
  : path.join(process.cwd(), 'data/uploads/inspections');

function safeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const safe = ext || 'bin';
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${safe}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fileType = (formData.get('fileType') as string) || 'image'; // 'report' | 'image'

    if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: '파일은 50MB 이하로 업로드하세요' }, { status: 400 });

    const subdir = fileType === 'report' ? 'reports' : 'images';
    const dir = path.join(UPLOAD_BASE, id, subdir);
    fs.mkdirSync(dir, { recursive: true });

    const filename = safeFilename(file.name);
    const filepath = path.join(dir, filename);
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buf);

    const url = `/api/inspections/${id}/files/${subdir}_${filename}`;
    return NextResponse.json({ url, filename, originalName: file.name, fileType });
  } catch (e) {
    console.error('[inspection upload]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
