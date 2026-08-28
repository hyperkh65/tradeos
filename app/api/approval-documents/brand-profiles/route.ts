import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { getCompanySettings } from '@/lib/pdf/company';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, name: row.name, isDefault: !!row.is_default,
    companyNameKo: row.company_name_ko, companyNameEn: row.company_name_en,
    logoUrl: row.logo_url, watermarkUrl: row.watermark_url, watermarkOpacity: row.watermark_opacity,
    primaryColor: row.primary_color, secondaryColor: row.secondary_color, accentColor: row.accent_color,
    footerText: row.footer_text, coverLayoutVariant: row.cover_layout_variant,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const db = getDb();
  const rows = db.prepare('SELECT * FROM company_brand_profiles WHERE deleted=0 ORDER BY is_default DESC, created_at DESC').all() as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toClient) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: '프로필 이름은 필수입니다.' }, { status: 400 });

  // "현재 회사설정에서 만들기" — 최초 값만 채워주고 이후로는 독립적으로 관리한다
  // (전역 회사설정이 나중에 바뀌어도 이미 만든 브랜드 프로필은 따라 바뀌지 않음).
  const seed = body.fromCompanySettings ? getCompanySettings() : null;

  const db = getDb();
  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO company_brand_profiles
    (id, name, is_default, company_name_ko, company_name_en, logo_url, watermark_url, watermark_opacity,
     primary_color, secondary_color, accent_color, footer_text, cover_layout_variant, created_by, created_by_name, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, body.name,
    body.companyNameKo ?? seed?.name ?? null, body.companyNameEn ?? seed?.nameEn ?? null,
    body.logoUrl ?? seed?.logoUrl ?? null, body.watermarkUrl ?? null,
    body.watermarkOpacity ?? 0.08, body.primaryColor ?? null, body.secondaryColor ?? null, body.accentColor ?? null,
    body.footerText ?? null, body.coverLayoutVariant ?? 'standard', user.id, user.name, ts, ts,
  );

  const row = db.prepare('SELECT * FROM company_brand_profiles WHERE id=?').get(id) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}
