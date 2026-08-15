import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const maxDuration = 30;

const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'shipments')
  : process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads/shipments'
    : path.join(process.cwd(), 'data/uploads/shipments');

// POST { filename } → { sheets: string[] }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { filename } = await req.json() as { filename: string };
    if (!filename) return NextResponse.json({ error: 'filename 필요' }, { status: 400 });

    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_BASE, id, safeName);
    if (!fs.existsSync(filePath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

    const ext = path.extname(safeName).slice(1).toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      return NextResponse.json({ error: 'Excel 파일만 지원' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const buf = fs.readFileSync(filePath);
    await wb.xlsx.load(buf);

    const sheets = wb.worksheets.map((ws: { name: string }) => ws.name);
    return NextResponse.json({ sheets });
  } catch (e) {
    console.error('[sheets]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
