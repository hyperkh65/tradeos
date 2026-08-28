import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents/brand-logos'
  : path.join(process.cwd(), 'data/uploads/approval-documents/brand-logos');

/**
 * 회사 로고 업로드 — 요청서 §3: "투명 배경 PNG 또는 SVG 사용 권장, 저해상도 로고 경고".
 * 업로드는 항상 허용하고(막지 않음) 해상도가 낮으면 warning만 반환한다.
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

  let warning: string | null = null;
  if (ext !== 'svg') {
    try {
      const meta = await sharp(filepath).metadata();
      if (meta.width && meta.width < 1000) {
        warning = '인쇄 품질을 위해 투명 배경의 고해상도 로고를 권장합니다. 권장 해상도는 가로 1,000px 이상 또는 벡터 SVG 파일입니다.';
      }
    } catch { /* ignore */ }
  }

  const logoUrl = `/api/approval-documents/brand-profiles/${profileId}/logo/${storedFilename}`;
  db.prepare('UPDATE company_brand_profiles SET logo_url=?, updated_at=? WHERE id=?').run(logoUrl, now(), profileId);

  return NextResponse.json({ data: { logoUrl, warning } });
}
