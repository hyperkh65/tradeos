import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/purchase-orders'
  : path.join(process.cwd(), 'data/uploads/purchase-orders');

function safeExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext) ? ext : 'jpg';
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > 30 * 1024 * 1024) return NextResponse.json({ error: '파일은 30MB 이하로 업로드하세요' }, { status: 400 });

    const dir = path.join(UPLOAD_BASE, id);
    fs.mkdirSync(dir, { recursive: true });

    const ext = safeExt(file.name);
    const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const filepath = path.join(dir, filename);

    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buf);

    const url = `/api/purchase-orders/${id}/images/${filename}`;
    return NextResponse.json({ url, filename });
  } catch (e) {
    console.error('[po upload]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
