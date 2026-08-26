import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/documents'
  : path.join(process.cwd(), 'data/uploads/documents');

function safeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  let filepath = '';
  try {
    const { id } = await params;
    if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json({ error: '멀티파트 요청만 지원합니다' }, { status: 400 });
    }
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const itemIndex = Number(formData.get('itemIndex'));

    if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (!Number.isInteger(itemIndex) || itemIndex < 0) return NextResponse.json({ error: '잘못된 품목 인덱스입니다' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: '파일 크기는 20MB 이하' }, { status: 400 });

    const db = getDb();
    const row = db.prepare('SELECT data_json FROM documents WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });
    const data = JSON.parse((row.data_json as string) || '{}');
    if (!Array.isArray(data.items) || !data.items[itemIndex]) {
      return NextResponse.json({ error: '해당 품목을 찾을 수 없습니다' }, { status: 400 });
    }

    const dir = path.join(UPLOAD_BASE, id, String(itemIndex));
    fs.mkdirSync(dir, { recursive: true });
    const filename = safeFilename(file.name);
    filepath = path.join(dir, filename);

    const nodeStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(nodeStream, fs.createWriteStream(filepath));

    const url = `/api/documents/${id}/files/${itemIndex}/${filename}`;
    const entry = { url, filename, originalName: file.name, size: file.size };

    data.items[itemIndex].images = Array.isArray(data.items[itemIndex].images) ? data.items[itemIndex].images : [];
    data.items[itemIndex].images.push(entry);
    db.prepare('UPDATE documents SET data_json=?, updated_at=? WHERE id=?').run(JSON.stringify(data), now(), id);

    return NextResponse.json({ data: entry });
  } catch (e) {
    if (filepath) { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
