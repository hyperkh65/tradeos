import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import type { ImportDocument, ImportDocType } from '@/types';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'imports')
  : process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads/imports'
    : path.join(process.cwd(), 'data/uploads/imports');

function getDocs(id: string): ImportDocument[] {
  const db = getDb();
  const row = db.prepare('SELECT documents_json FROM imports WHERE id=?').get(id) as { documents_json: string } | undefined;
  if (!row) return [];
  try { return JSON.parse(row.documents_json || '[]'); } catch { return []; }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ data: getDocs(id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT id FROM imports WHERE id=?').get(id);
    if (!row) return NextResponse.json({ error: '통관 없음' }, { status: 404 });

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const docType = (formData.get('docType') as ImportDocType) || 'other';
    const customName = formData.get('customName') as string | null;
    if (!files.length) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const dir = path.join(UPLOAD_BASE, id);
    fs.mkdirSync(dir, { recursive: true });

    const existing = getDocs(id);
    const newDocs: ImportDocument[] = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      const docId = newId();
      const safeName = `${docId}${ext}`;
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(path.join(dir, safeName), buf);

      newDocs.push({
        id: docId,
        filename: safeName,
        originalName: file.name,
        docType,
        customName: customName || undefined,
        url: `/api/imports/${id}/documents/${safeName}`,
        size: file.size,
        uploadedAt: now(),
      });
    }

    const allDocs = [...existing, ...newDocs];
    db.prepare('UPDATE imports SET documents_json=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(allDocs), now(), id);

    return NextResponse.json({ data: newDocs });
  } catch (e) {
    console.error('[import documents POST]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const docId = req.nextUrl.searchParams.get('docId');
    if (!docId) return NextResponse.json({ error: 'docId 필요' }, { status: 400 });

    const db = getDb();
    const docs = getDocs(id);
    const target = docs.find(d => d.id === docId);
    if (target) {
      try { fs.unlinkSync(path.join(UPLOAD_BASE, id, target.filename)); } catch { /* ignore */ }
    }
    db.prepare('UPDATE imports SET documents_json=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(docs.filter(d => d.id !== docId)), now(), id);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
