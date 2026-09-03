import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardInspectionFormRequest } from '@/lib/approval-inspection/token';
import { UPLOAD_BASE } from '@/lib/approval-inspection/storage';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; productId: string; photoId: string }> }) {
  const { token, productId, photoId } = await params;
  const guard = guardInspectionFormRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const photo = db.prepare('SELECT * FROM approval_inspection_photos WHERE id=? AND project_id=? AND product_id=?')
    .get(photoId, guard.project.id, productId) as Record<string, unknown> | undefined;
  if (!photo) return NextResponse.json({ error: '없음' }, { status: 404 });

  const variant = req.nextUrl.searchParams.get('variant');
  let filepath: string;
  if (variant === 'edited' && photo.edited_file_path) {
    filepath = String(photo.edited_file_path);
  } else {
    filepath = path.join(UPLOAD_BASE, guard.project.id, photoId, String(photo.stored_filename));
  }
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '없음' }, { status: 404 });
  const ext = filepath.split('.').pop()?.toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
  return new NextResponse(new Uint8Array(fs.readFileSync(filepath)), { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300' } });
}
