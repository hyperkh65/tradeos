import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { classifyText, extractExcelText, extractPdfText } from '@/lib/classify-document';
import { newId } from '@/lib/db/sqlite';
import type { ShipDocument } from '@/types';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/shipments'
  : path.join(process.cwd(), 'data/uploads/shipments');

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare('SELECT documents_json FROM shipments WHERE id=?').get(id) as { documents_json: string } | undefined;
  const docs: ShipDocument[] = row ? (() => { try { return JSON.parse(row.documents_json || '[]'); } catch { return []; } })() : [];
  return NextResponse.json({ data: docs });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT documents_json FROM shipments WHERE id=?').get(id) as { documents_json: string } | undefined;
    if (!row) return NextResponse.json({ error: '선적 없음' }, { status: 404 });

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    if (!files.length) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const dir = path.join(UPLOAD_BASE, id);
    fs.mkdirSync(dir, { recursive: true });

    const existing: ShipDocument[] = (() => { try { return JSON.parse(row.documents_json || '[]'); } catch { return []; } })();
    const newDocs: ShipDocument[] = [];

    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      const docId = newId();
      const safeName = `${docId}${ext}`;
      const filePath = path.join(dir, safeName);

      // Stream to disk
      const nodeStream = Readable.fromWeb(file.stream() as any);
      await pipeline(nodeStream, fs.createWriteStream(filePath));

      // Read file for classification
      const buf = fs.readFileSync(filePath) as unknown as Buffer;
      let text = '';
      try {
        if (ext === '.pdf') {
          text = await extractPdfText(buf);
        } else if (ext === '.xlsx' || ext === '.xls') {
          text = await extractExcelText(buf);
        }
      } catch { /* skip text extraction */ }

      const { docType, detectedTypes } = classifyText(text, file.name);

      const doc: ShipDocument = {
        id: docId,
        filename: safeName,
        originalName: file.name,
        docType,
        url: `/api/shipments/${id}/documents/${safeName}`,
        size: file.size,
        uploadedAt: now(),
        // @ts-ignore — store extra metadata
        detectedTypes,
      };

      newDocs.push(doc);
    }

    const allDocs = [...existing, ...newDocs];
    db.prepare('UPDATE shipments SET documents_json=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(allDocs), now(), id);

    return NextResponse.json({ data: newDocs });
  } catch (e) {
    console.error('[shipment documents POST]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const docId = req.nextUrl.searchParams.get('docId');
    if (!docId) return NextResponse.json({ error: 'docId 필요' }, { status: 400 });

    const db = getDb();
    const row = db.prepare('SELECT documents_json FROM shipments WHERE id=?').get(id) as { documents_json: string } | undefined;
    if (!row) return NextResponse.json({ error: '없음' }, { status: 404 });

    const docs: ShipDocument[] = (() => { try { return JSON.parse(row.documents_json || '[]'); } catch { return []; } })();
    const target = docs.find(d => d.id === docId);
    if (target) {
      const filePath = path.join(UPLOAD_BASE, id, target.filename);
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }

    const updated = docs.filter(d => d.id !== docId);
    db.prepare('UPDATE shipments SET documents_json=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(updated), now(), id);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
