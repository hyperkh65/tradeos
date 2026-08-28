import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

const EDITABLE_FIELDS: Record<string, string> = {
  name: 'name', companyNameKo: 'company_name_ko', companyNameEn: 'company_name_en',
  primaryColor: 'primary_color', secondaryColor: 'secondary_color', accentColor: 'accent_color',
  footerText: 'footer_text', coverLayoutVariant: 'cover_layout_variant', watermarkOpacity: 'watermark_opacity',
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { profileId } = await params;
  const db = getDb();
  const profile = db.prepare('SELECT id FROM company_brand_profiles WHERE id=? AND deleted=0').get(profileId);
  if (!profile) return NextResponse.json({ error: '없음' }, { status: 404 });

  const body = await req.json();
  if (typeof body.watermarkOpacity === 'number' && (body.watermarkOpacity < 0 || body.watermarkOpacity > 1)) {
    return NextResponse.json({ error: '워터마크 불투명도는 0~1 사이 값이어야 합니다.' }, { status: 400 });
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) { sets.push(`${column}=?`); values.push(body[key]); }
  }
  if (sets.length === 0) return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 });

  sets.push('updated_at=?');
  values.push(now(), profileId);
  db.prepare(`UPDATE company_brand_profiles SET ${sets.join(', ')} WHERE id=?`).run(...values);

  const row = db.prepare('SELECT * FROM company_brand_profiles WHERE id=?').get(profileId) as Record<string, unknown>;
  return NextResponse.json({
    data: {
      id: row.id, name: row.name, isDefault: !!row.is_default,
      companyNameKo: row.company_name_ko, companyNameEn: row.company_name_en,
      logoUrl: row.logo_url, watermarkUrl: row.watermark_url, watermarkOpacity: row.watermark_opacity,
      primaryColor: row.primary_color, secondaryColor: row.secondary_color, accentColor: row.accent_color,
      footerText: row.footer_text, coverLayoutVariant: row.cover_layout_variant,
    },
  });
}
