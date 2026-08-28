import { getDb, newId, now } from '@/lib/db/sqlite';

export interface DocTemplate {
  id: string; name: string; styleKey: string; isBuiltin: boolean;
  baseFont: string; headingFont: string;
}

export interface BrandProfile {
  id: string; name: string; isDefault: boolean;
  companyNameKo: string | null; companyNameEn: string | null;
  logoUrl: string | null; watermarkUrl: string | null; watermarkOpacity: number;
  primaryColor: string | null; secondaryColor: string | null; accentColor: string | null;
  footerText: string | null;
}

// 요청서 §11 "정식 승인서형 / 기술 사양서형 / 간결한 제품 사양서형" 3종 빌트인.
const BUILTIN_TEMPLATES: { name: string; styleKey: string; baseFont: string; headingFont: string }[] = [
  { name: '정식 승인서형', styleKey: 'classic', baseFont: 'Noto Serif CJK KR', headingFont: 'Noto Serif CJK KR' },
  { name: '기술 사양서형', styleKey: 'modern', baseFont: 'Noto Sans CJK KR', headingFont: 'Noto Sans CJK KR' },
  { name: '간결한 제품 사양서형', styleKey: 'compact', baseFont: 'Noto Sans CJK KR', headingFont: 'Noto Sans CJK KR' },
];

/** 빌트인 템플릿이 아직 없으면 최초 접근 시 한 번만 시드한다 — 마이그레이션에 넣지 않고
 * 지연 시드하는 이유는 나중에 이름/스타일을 바꿔도 기존 프로젝트가 참조하는 id가
 * 안정적으로 유지되게 하기 위함(그냥 INSERT OR IGNORE로 매번 재확인). */
export function ensureBuiltinTemplates(): DocTemplate[] {
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM approval_doc_templates WHERE is_builtin=1`).all() as Record<string, unknown>[];
  if (existing.length >= BUILTIN_TEMPLATES.length) return existing.map(toTemplate);

  const ts = now();
  const insert = db.prepare(`INSERT INTO approval_doc_templates (id, name, style_key, is_builtin, base_font, heading_font, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)`);
  db.transaction(() => {
    for (const t of BUILTIN_TEMPLATES) {
      const already = db.prepare('SELECT id FROM approval_doc_templates WHERE style_key=? AND is_builtin=1').get(t.styleKey);
      if (!already) insert.run(newId(), t.name, t.styleKey, t.baseFont, t.headingFont, ts, ts);
    }
  })();
  return (db.prepare(`SELECT * FROM approval_doc_templates WHERE is_builtin=1`).all() as Record<string, unknown>[]).map(toTemplate);
}

function toTemplate(r: Record<string, unknown>): DocTemplate {
  return { id: r.id as string, name: r.name as string, styleKey: r.style_key as string, isBuiltin: !!r.is_builtin, baseFont: (r.base_font as string) || 'Noto Sans CJK KR', headingFont: (r.heading_font as string) || 'Noto Sans CJK KR' };
}

export function getTemplate(templateId: string | null): DocTemplate | null {
  if (!templateId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM approval_doc_templates WHERE id=?').get(templateId) as Record<string, unknown> | undefined;
  return row ? toTemplate(row) : null;
}

export function getBrandProfile(profileId: string | null): BrandProfile | null {
  if (!profileId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM company_brand_profiles WHERE id=? AND deleted=0').get(profileId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string, name: row.name as string, isDefault: !!row.is_default,
    companyNameKo: row.company_name_ko as string | null, companyNameEn: row.company_name_en as string | null,
    logoUrl: row.logo_url as string | null, watermarkUrl: row.watermark_url as string | null, watermarkOpacity: (row.watermark_opacity as number) ?? 0.08,
    primaryColor: row.primary_color as string | null, secondaryColor: row.secondary_color as string | null, accentColor: row.accent_color as string | null,
    footerText: row.footer_text as string | null,
  };
}
