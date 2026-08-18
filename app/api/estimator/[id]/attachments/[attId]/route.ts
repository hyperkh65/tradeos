import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { readFile } from 'fs/promises';
import { join } from 'path';

const UPLOAD_BASE = join(process.cwd(), 'data', 'estimator-att');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attId: string }> }
) {
  const { id, attId } = await params;
  const db = getDb();
  const row = db.prepare('SELECT attachments_json FROM estimator_cases WHERE id=?').get(id) as { attachments_json?: string } | undefined;
  const atts: { id: string; name: string; filename: string }[] = JSON.parse(row?.attachments_json || '[]');
  const att = atts.find(a => a.id === attId);
  if (!att) return NextResponse.json({ error: '없음' }, { status: 404 });

  try {
    const buf = await readFile(join(UPLOAD_BASE, id, att.filename));
    const encoded = encodeURIComponent(att.name).replace(/'/g, "%27");
    return new NextResponse(buf, {
      headers: {
        'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buf.length),
      },
    });
  } catch {
    return NextResponse.json({ error: '파일 없음' }, { status: 404 });
  }
}
