import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { parseDeposits } from '@/lib/deposits';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/commission-deposits'
  : path.join(process.cwd(), 'data/uploads/commission-deposits');

function safeFilename(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; depositId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  let filepath = '';
  try {
    const { id, depositId } = await params;
    if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json({ error: '멀티파트 요청만 지원합니다' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: '파일 크기는 50MB 이하' }, { status: 400 });

    const dir = path.join(UPLOAD_BASE, id, depositId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = safeFilename(file.name);
    filepath = path.join(dir, filename);

    const nodeStream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(nodeStream, fs.createWriteStream(filepath));

    const url = `/api/commissions/${id}/deposits/files/${depositId}_${filename}`;
    const entry = { url, filename, originalName: file.name, size: file.size };

    const db = getDb();
    const row = db.prepare('SELECT deposits_json FROM commissions WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) { fs.unlinkSync(filepath); return NextResponse.json({ error: '커미션을 찾을 수 없습니다.' }, { status: 404 }); }

    const deposits = parseDeposits(row.deposits_json as string);
    const dep = deposits.find(d => d.id === depositId);
    if (!dep) { fs.unlinkSync(filepath); return NextResponse.json({ error: '입금 항목을 찾을 수 없습니다.' }, { status: 404 }); }
    dep.files.push(entry);
    db.prepare('UPDATE commissions SET deposits_json=? WHERE id=?').run(JSON.stringify(deposits), id);

    return NextResponse.json({ data: entry });
  } catch (e) {
    if (filepath) { try { fs.unlinkSync(filepath); } catch { /* ignore */ } }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
