import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { DEFAULT_COMPANY } from '@/app/api/settings/company/route';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export const maxDuration = 120;

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/pi'
  : path.join(process.cwd(), 'data/uploads/pi');

function getCompanySettings(): Record<string, string> {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('company') as { value: string } | undefined;
    const saved = row ? JSON.parse(row.value) : {};
    return { ...DEFAULT_COMPANY, ...saved };
  } catch {
    return DEFAULT_COMPANY;
  }
}

async function fetchImageBuffer(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    return null;
  }
}

async function stampExcel(
  inputPath: string,
  outputPath: string,
  poNumber: string,
  piNumber: string,
  _companyName: string,
  stampImgBuf: Uint8Array | null,
) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inputPath);

  for (const ws of wb.worksheets) {
    const lastDataRow = ws.lastRow?.number ?? 1;
    const insertRow = lastDataRow + 2;

    if (stampImgBuf) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imgId = wb.addImage({ buffer: Buffer.from(stampImgBuf) as any, extension: 'png' });
      ws.addImage(imgId, {
        tl: { col: 0, row: insertRow - 1 },
        ext: { width: 120, height: 80 },
      });
    }

    const labelCell = ws.getCell(insertRow, stampImgBuf ? 3 : 1);
    // ASCII only to avoid encoding issues; seal image carries company identity
    labelCell.value = `PO: ${poNumber}\nPI: ${piNumber}\nCONFIRMED`;
    labelCell.font = { bold: true, color: { argb: 'FFCC0000' }, size: 10 };
    labelCell.alignment = { wrapText: true, vertical: 'middle' };
    labelCell.border = {
      top: { style: 'medium', color: { argb: 'FFCC0000' } },
      left: { style: 'medium', color: { argb: 'FFCC0000' } },
      bottom: { style: 'medium', color: { argb: 'FFCC0000' } },
      right: { style: 'medium', color: { argb: 'FFCC0000' } },
    };
    ws.getRow(insertRow).height = 50;
  }

  await wb.xlsx.writeFile(outputPath);
}

async function stampPdf(
  inputPath: string,
  outputPath: string,
  poNumber: string,
  piNumber: string,
  _companyName: string,
  stampImgBuf: Uint8Array | null,
) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width } = lastPage.getSize();
  const red = rgb(0.7, 0, 0);

  const margin = 40;
  const padding = 10;

  // Embed seal image first to get its natural dimensions
  let embeddedImg = null;
  let imgDrawW = 0;
  let imgDrawH = 0;

  if (stampImgBuf) {
    try {
      embeddedImg = await (async () => {
        try { return await pdfDoc.embedPng(stampImgBuf); } catch { return await pdfDoc.embedJpg(stampImgBuf); }
      })();
      // Scale to fit within 180×120 while preserving aspect ratio
      const maxW = 180;
      const maxH = 120;
      const { width: nw, height: nh } = embeddedImg.scale(1);
      const scale = Math.min(maxW / nw, maxH / nh);
      imgDrawW = nw * scale;
      imgDrawH = nh * scale;
    } catch { /* skip */ }
  }

  // Box dimensions: image width + text column (200px) + padding
  const textColW = 200;
  const stampH = Math.max(imgDrawH, 80) + padding * 2;
  const stampW = (embeddedImg ? imgDrawW + padding : 0) + textColW + padding * 2;
  const x = (width - stampW) / 2;
  const y = margin;

  // Red border box
  lastPage.drawRectangle({ x, y, width: stampW, height: stampH, borderColor: red, borderWidth: 2 });

  // Draw seal image — vertically centered, natural aspect ratio
  if (embeddedImg) {
    lastPage.drawImage(embeddedImg, {
      x: x + padding,
      y: y + (stampH - imgDrawH) / 2,
      width: imgDrawW,
      height: imgDrawH,
    });
  }

  const textX = embeddedImg ? x + imgDrawW + padding * 2 : x + padding;
  const topY = y + stampH - padding - 14;

  // Only ASCII text to avoid WinAnsi encoding errors with Korean
  lastPage.drawText(`PO: ${poNumber}`, {
    x: textX, y: topY,
    size: 12, font, color: red,
  });
  lastPage.drawText(`PI: ${piNumber}`, {
    x: textX, y: topY - 22,
    size: 12, font, color: red,
  });
  lastPage.drawText('CONFIRMED', {
    x: textX, y: topY - 44,
    size: 12, font, color: red,
  });

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

    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    // Load company settings (name + stamp image)
    const company = getCompanySettings();
    const companyName = company.name || 'NEXPORT';
    const stampImgBuf: Uint8Array | null = company.stampUrl ? await fetchImageBuffer(company.stampUrl) : null;

    const dir = path.join(UPLOAD_BASE, id);
    fs.mkdirSync(dir, { recursive: true });

    const ext = path.extname(file.name).toLowerCase();
    const safeName = `pi_original${ext}`;
    const originalPath = path.join(dir, safeName);

    const nodeStream = Readable.fromWeb(file.stream() as any);
    await pipeline(nodeStream, fs.createWriteStream(originalPath));

    const stampedName = `pi_stamped${ext}`;
    const stampedPath = path.join(dir, stampedName);

    if (ext === '.xlsx' || ext === '.xls') {
      await stampExcel(originalPath, stampedPath, poNumber, piNumber, companyName, stampImgBuf);
    } else if (ext === '.pdf') {
      await stampPdf(originalPath, stampedPath, poNumber, piNumber, companyName, stampImgBuf);
    } else {
      fs.copyFileSync(originalPath, stampedPath);
    }

    const ts = now();
    const piFileUrl = `/api/purchase-orders/${id}/pi-files/pi_original${ext}`;
    const piStampedUrl = `/api/purchase-orders/${id}/pi-files/pi_stamped${ext}`;

    const currentStatus = row.status as string;
    const newStatus = currentStatus === 'draft' && piNumber ? 'confirmed' : currentStatus;

    db.prepare('UPDATE purchase_orders SET pi_number=?,pi_file_url=?,pi_stamped_url=?,status=?,updated_at=? WHERE id=?')
      .run(piNumber, piFileUrl, piStampedUrl, newStatus, ts, id);

    return NextResponse.json({ piFileUrl, piStampedUrl, piNumber, status: newStatus });
  } catch (e) {
    console.error('[PI upload]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
