import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/forwarder-rates'
  : path.join(process.cwd(), 'data/uploads/forwarder-rates');

function safeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
}

/** 견적서 원본 파일(엑셀/PDF) 첨부 — 나중에 실제 수치를 다시 대조할 때 참고용. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  let filepath = '';
  try {
    const { id } = await params;
    const row = getDb().prepare('SELECT id FROM forwarder_rates WHERE id=?').get(id);
    if (!row) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });

    if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json({ error: '멀티파트 요청만 지원합니다' }, { status: 400 });
    }
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: '파일 크기는 50MB 이하' }, { status: 400 });

    const dir = path.join(UPLOAD_BASE, id);
    fs.mkdirSync(dir, { recursive: true });
    const filename = safeFilename(file.name);
    filepath = path.join(dir, filename);

    const nodeStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(nodeStream, fs.createWriteStream(filepath));

    const url = `/api/forwarder-rates/${id}/files/${filename}`;
    const db = getDb();
    db.prepare('UPDATE forwarder_rates SET source_file_url=?, updated_at=? WHERE id=?').run(url, now(), id);

    return NextResponse.json({ data: { url, originalName: file.name } });
  } catch (e) {
    if (filepath) { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
