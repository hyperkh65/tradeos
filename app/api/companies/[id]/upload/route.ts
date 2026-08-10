import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/companies'
  : path.join(process.cwd(), 'data/uploads/companies');

function safeExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['pdf', 'jpg', 'jpeg', 'png', 'gif'].includes(ext) ? ext : 'bin';
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fileType = (formData.get('type') as string) || 'file'; // 'biz_reg' | 'bank_copy'

    if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: '파일은 20MB 이하로 업로드하세요' }, { status: 400 });

    const dir = path.join(UPLOAD_BASE, id);
    fs.mkdirSync(dir, { recursive: true });

    const ext = safeExt(file.name);
    const filename = `${fileType}_${Date.now()}.${ext}`;
    const filepath = path.join(dir, filename);

    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buf);

    const fileUrl = `/api/companies/${id}/files/${filename}`;

    // Update company record with file path
    const db = getDb();
    const col = fileType === 'biz_reg' ? 'biz_reg_file' : 'bank_copy_file';
    db.prepare(`UPDATE companies SET ${col}=?, updated_at=? WHERE id=?`).run(fileUrl, new Date().toISOString(), id);

    return NextResponse.json({ url: fileUrl, name: file.name });
  } catch (e) {
    console.error('[upload]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
