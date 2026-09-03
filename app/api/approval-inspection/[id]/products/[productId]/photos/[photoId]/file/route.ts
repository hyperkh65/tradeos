import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { UPLOAD_BASE } from '../../route';
import fs from 'fs';
import path from 'path';

/** 크롭 도구가 항상 "가공되지 않은" 원본 위에서 좌표를 잡아야 하므로 기본은 원본을
 * 서빙한다 — 편집 결과를 보려면 ?variant=edited를 붙인다(image-edit.ts 주석과 동일 원칙). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string; photoId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId, photoId } = await params;
  const db = getDb();
  const photo = db.prepare('SELECT * FROM approval_inspection_photos WHERE id=? AND project_id=? AND product_id=?')
    .get(photoId, id, productId) as Record<string, unknown> | undefined;
  if (!photo) return NextResponse.json({ error: '없음' }, { status: 404 });

  const variant = req.nextUrl.searchParams.get('variant');
  let filepath: string;
  if (variant === 'edited' && photo.edited_file_path) {
    filepath = String(photo.edited_file_path);
  } else {
    filepath = path.join(UPLOAD_BASE, id, photoId, String(photo.stored_filename));
  }
  if (!fs.existsSync(filepath)) return NextResponse.json({ error: '없음' }, { status: 404 });
  const ext = filepath.split('.').pop()?.toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
  return new NextResponse(new Uint8Array(fs.readFileSync(filepath)), { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300' } });
}
