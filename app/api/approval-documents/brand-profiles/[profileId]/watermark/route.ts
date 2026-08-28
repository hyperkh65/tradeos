import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';

export const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents/brand-watermarks'
  : path.join(process.cwd(), 'data/uploads/approval-documents/brand-watermarks');

/**
 * 워터마크 이미지 업로드 — 로고 업로드(brand-profiles/[profileId]/logo)와 동일한 패턴.
 * 실제 반투명 처리는 렌더링 시점(generate/route.ts)에 watermark_opacity를 적용해 매번
 * 새로 계산한다 — 원본 파일 자체는 불투명 원본 그대로 보관(비파괴).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { profileId } = await params;
  const db = getDb();
  const profile = db.prepare('SELECT id FROM company_brand_profiles WHERE id=? AND deleted=0').get(profileId);
  if (!profile) return NextResponse.json({ error: '없음' }, { status: 404 });

  if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
    return NextResponse.json({ error: '멀티파트 요청만 지원합니다.' }, { status: 400 });
  }
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'svg'].includes(ext)) {
    return NextResponse.json({ error: 'PNG, JPG, SVG 파일만 업로드할 수 있습니다.' }, { status: 400 });
  }

  fs.mkdirSync(UPLOAD_BASE, { recursive: true });
  const storedFilename = `${profileId}_${Date.now()}.${ext}`;
  const filepath = path.join(UPLOAD_BASE, storedFilename);
  fs.writeFileSync(filepath, Buffer.from(await file.arrayBuffer()));

  const watermarkUrl = `/api/approval-documents/brand-profiles/${profileId}/watermark/${storedFilename}`;
  db.prepare('UPDATE company_brand_profiles SET watermark_url=?, updated_at=? WHERE id=?').run(watermarkUrl, now(), profileId);

  return NextResponse.json({ data: { watermarkUrl } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { profileId } = await params;
  const db = getDb();
  const profile = db.prepare('SELECT id FROM company_brand_profiles WHERE id=? AND deleted=0').get(profileId);
  if (!profile) return NextResponse.json({ error: '없음' }, { status: 404 });
  db.prepare('UPDATE company_brand_profiles SET watermark_url=NULL, updated_at=? WHERE id=?').run(now(), profileId);
  return NextResponse.json({ data: { ok: true } });
}
