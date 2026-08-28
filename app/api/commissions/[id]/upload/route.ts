import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { syncIndexOnWrite } from '@/lib/ai/sync';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/commissions'
  : path.join(process.cwd(), 'data/uploads/commissions');

function safeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  let filepath = '';
  try {
    const { id } = await params;
    const statusRow = getDb().prepare('SELECT status FROM commissions WHERE id=?').get(id) as { status: string } | undefined;
    if (!statusRow) return NextResponse.json({ error: '커미션 기록을 찾을 수 없습니다.' }, { status: 404 });
    if (statusRow.status === 'closed') return NextResponse.json({ error: '마감된 건은 수정할 수 없습니다. 먼저 마감을 취소하세요.' }, { status: 409 });
    if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json({ error: '멀티파트 요청만 지원합니다' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fileType = (formData.get('fileType') as string) === 'deposit' ? 'deposit' : 'invoice';

    if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: '파일 크기는 50MB 이하' }, { status: 400 });

    const subdir = fileType === 'deposit' ? 'deposit' : 'invoice';
    const dir = path.join(UPLOAD_BASE, id, subdir);
    fs.mkdirSync(dir, { recursive: true });

    const filename = safeFilename(file.name);
    filepath = path.join(dir, filename);

    const nodeStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(nodeStream, fs.createWriteStream(filepath));

    const url = `/api/commissions/${id}/files/${subdir}_${filename}`;
    const entry = { url, filename, originalName: file.name, size: file.size, uploadedAt: now() };

    const db = getDb();
    const row = db.prepare('SELECT invoice_files_json, deposit_files_json FROM commissions WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) { fs.unlinkSync(filepath); return NextResponse.json({ error: '커미션 기록을 찾을 수 없습니다.' }, { status: 404 }); }

    if (fileType === 'deposit') {
      const list = JSON.parse((row.deposit_files_json as string) || '[]');
      list.push(entry);
      db.prepare('UPDATE commissions SET deposit_files_json=?, updated_at=? WHERE id=?').run(JSON.stringify(list), now(), id);
    } else {
      const list = JSON.parse((row.invoice_files_json as string) || '[]');
      list.push(entry);
      db.prepare('UPDATE commissions SET invoice_files_json=?, updated_at=? WHERE id=?').run(JSON.stringify(list), now(), id);
    }
    syncIndexOnWrite('commission', id);

    return NextResponse.json({ data: entry });
  } catch (e) {
    if (filepath) { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
