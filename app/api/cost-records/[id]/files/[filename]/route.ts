import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'costs')
  : process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads/costs'
    : path.join(process.cwd(), 'data/uploads/costs');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { id, filename } = await params;
  const filePath = path.join(UPLOAD_BASE, id, filename);

  if (!filePath.startsWith(UPLOAD_BASE) || !fs.existsSync(filePath)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip',
  };

  return new NextResponse(buf, {
    headers: {
      'Content-Type': mimeMap[ext] ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
