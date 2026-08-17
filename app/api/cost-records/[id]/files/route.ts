import { NextRequest, NextResponse } from 'next/server';
import { getDb, now, newId } from '@/lib/db/sqlite';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'costs')
  : process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads/costs'
    : path.join(process.cwd(), 'data/uploads/costs');

interface CostFile {
  id: string; originalName: string; filename: string;
  url: string; size: number; uploadedAt: string;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT files_json FROM cost_records WHERE id=?').get(id) as { files_json: string } | undefined;
  const files: CostFile[] = row ? (() => { try { return JSON.parse(row.files_json || '[]'); } catch { return []; } })() : [];
  return NextResponse.json({ data: files });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT files_json FROM cost_records WHERE id=?').get(id) as { files_json: string } | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    if (!files.length) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const dir = path.join(UPLOAD_BASE, id);
    fs.mkdirSync(dir, { recursive: true });

    const existing: CostFile[] = (() => { try { return JSON.parse(row.files_json || '[]'); } catch { return []; } })();
    const newFiles: CostFile[] = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      const fileId = newId();
      const safeName = `${fileId}${ext}`;
      const filePath = path.join(dir, safeName);

      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buf);

      newFiles.push({
        id: fileId,
        originalName: file.name,
        filename: safeName,
        url: `/api/cost-records/${id}/files/${safeName}`,
        size: file.size,
        uploadedAt: now(),
      });
    }

    const allFiles = [...existing, ...newFiles];
    db.prepare('UPDATE cost_records SET files_json=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(allFiles), now(), id);

    return NextResponse.json({ data: newFiles });
  } catch (e) {
    console.error('[cost-files POST]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const fileId = req.nextUrl.searchParams.get('fileId');
    if (!fileId) return NextResponse.json({ error: 'fileId 필요' }, { status: 400 });

    const db = getDb();
    const row = db.prepare('SELECT files_json FROM cost_records WHERE id=?').get(id) as { files_json: string } | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const files: CostFile[] = (() => { try { return JSON.parse(row.files_json || '[]'); } catch { return []; } })();
    const target = files.find(f => f.id === fileId);
    if (target) {
      const filePath = path.join(UPLOAD_BASE, id, target.filename);
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }

    const updated = files.filter(f => f.id !== fileId);
    db.prepare('UPDATE cost_records SET files_json=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(updated), now(), id);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
