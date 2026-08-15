import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const maxDuration = 30;

const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'shipments')
  : process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads/shipments'
    : path.join(process.cwd(), 'data/uploads/shipments');

// POST { filename, sheet? } → { data: ParsedItem[], count, message }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { filename, sheet } = await req.json() as { filename: string; sheet?: string };
    if (!filename) return NextResponse.json({ error: 'filename 필요' }, { status: 400 });

    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_BASE, id, safeName);
    if (!fs.existsSync(filePath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

    const ext = path.extname(safeName).slice(1).toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return NextResponse.json({ error: 'Excel 또는 CSV 파일만 지원합니다' }, { status: 400 });
    }

    const buf = fs.readFileSync(filePath);
    const fakeFile = new File([buf], safeName, { type: 'application/octet-stream' });
    const { parseItemsFromFile } = await import('@/lib/import-parse-items');
    return parseItemsFromFile(fakeFile, sheet);
  } catch (e) {
    console.error('[shipment parse-items]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
