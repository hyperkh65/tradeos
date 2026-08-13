import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/pi'
  : path.join(process.cwd(), 'data/uploads/pi');

async function stampExcel(inputPath: string, outputPath: string, poNumber: string, piNumber: string, companyName: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inputPath);

  const stampText = `[확인인] ${companyName}\nPO: ${poNumber}  PI: ${piNumber}`;

  wb.worksheets.forEach((ws) => {
    const lastRow = ws.lastRow?.number ?? 1;
    const stampRow = ws.getRow(lastRow + 2);
    const cell = stampRow.getCell(1);
    cell.value = stampText;
    cell.font = { bold: true, color: { argb: 'FFCC0000' }, size: 11 };
    cell.alignment = { wrapText: true, vertical: 'middle' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FFCC0000' } },
      left: { style: 'medium', color: { argb: 'FFCC0000' } },
      bottom: { style: 'medium', color: { argb: 'FFCC0000' } },
      right: { style: 'medium', color: { argb: 'FFCC0000' } },
    };
    ws.mergeCells(lastRow + 2, 1, lastRow + 3, 4);
    stampRow.height = 40;
    stampRow.commit();
  });

  await wb.xlsx.writeFile(outputPath);
}

async function stampPdf(inputPath: string, outputPath: string, poNumber: string, piNumber: string, companyName: string) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width } = lastPage.getSize();

  const stampW = 200;
  const stampH = 70;
  const x = (width - stampW) / 2;
  const y = 30;
  const red = rgb(0.7, 0, 0);

  // Red rectangle border
  lastPage.drawRectangle({ x, y, width: stampW, height: stampH, borderColor: red, borderWidth: 2 });

  // Company name
  lastPage.drawText(companyName, { x: x + 10, y: y + stampH - 20, size: 13, font, color: red });
  // PO number
  lastPage.drawText(`PO: ${poNumber}`, { x: x + 10, y: y + stampH - 38, size: 10, font, color: red });
  // PI number
  lastPage.drawText(`PI: ${piNumber}`, { x: x + 10, y: y + stampH - 54, size: 10, font, color: red });
  // Confirmation text
  lastPage.drawText('CONFIRMED', { x: x + 120, y: y + stampH - 42, size: 14, font, color: red });

  const out = await pdfDoc.save();
  fs.writeFileSync(outputPath, out);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: '발주 없음' }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const piNumber = (formData.get('piNumber') as string) || (row.pi_number as string) || '';
    const poNumber = row.business_id as string;
    const companyName = (process.env.COMPANY_NAME || 'NEXPORT');

    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const dir = path.join(UPLOAD_BASE, id);
    fs.mkdirSync(dir, { recursive: true });

    const ext = path.extname(file.name).toLowerCase();
    const safeName = `pi_original${ext}`;
    const originalPath = path.join(dir, safeName);

    // Stream file to disk
    const nodeStream = Readable.fromWeb(file.stream() as any);
    await pipeline(nodeStream, fs.createWriteStream(originalPath));

    // Generate stamped file
    const stampedName = `pi_stamped${ext}`;
    const stampedPath = path.join(dir, stampedName);

    if (ext === '.xlsx' || ext === '.xls') {
      await stampExcel(originalPath, stampedPath, poNumber, piNumber, companyName);
    } else if (ext === '.pdf') {
      await stampPdf(originalPath, stampedPath, poNumber, piNumber, companyName);
    } else {
      fs.copyFileSync(originalPath, stampedPath);
    }

    const ts = now();
    const piFileUrl = `/api/purchase-orders/${id}/pi-files/pi_original${ext}`;
    const piStampedUrl = `/api/purchase-orders/${id}/pi-files/pi_stamped${ext}`;

    // Save PI number + urls + auto-confirm if draft
    const currentStatus = row.status as string;
    const newStatus = currentStatus === 'draft' && piNumber ? 'confirmed' : currentStatus;

    db.prepare('UPDATE purchase_orders SET pi_number=?,pi_file_url=?,pi_stamped_url=?,status=?,updated_at=? WHERE id=?')
      .run(piNumber, piFileUrl, piStampedUrl, newStatus, ts, id);

    return NextResponse.json({
      piFileUrl,
      piStampedUrl,
      piNumber,
      status: newStatus,
    });
  } catch (e) {
    console.error('[PI upload]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
