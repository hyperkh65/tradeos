import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardSupplierRequest } from '@/lib/supplier-form/token';
import { writeAuditLog } from '@/lib/supplier-form/audit';
import { DISPLAY_FIELDS, BASE_MODEL_INFO_FIELDS, ORIGIN_MARKING_SUBFIELDS, LED_ARRAY_SUBFIELDS, type Lang, type TranslatableValue } from '@/lib/supplier-form/field-schema';
import { translateToKorean } from '@/lib/supplier-form/translate';

const PRESERVE_ORIGINAL_KEYS = new Set([
  ...DISPLAY_FIELDS.filter(f => f.preserveOriginal).map(f => f.key),
  ...ORIGIN_MARKING_SUBFIELDS, ...LED_ARRAY_SUBFIELDS,
  ...BASE_MODEL_INFO_FIELDS.map(f => f.key),
]);

async function buildTranslatableValue(key: string, original: string, lang: Lang, existing?: TranslatableValue): Promise<TranslatableValue> {
  const preserve = PRESERVE_ORIGINAL_KEYS.has(key) || lang === 'ko';
  let korean = existing?.korean ?? '';
  let translationStatus: TranslatableValue['translationStatus'] = existing?.translationStatus ?? 'none';

  if (preserve) {
    korean = original;
    translationStatus = 'confirmed';
  } else if (!existing || existing.original !== original) {
    // 원문이 바뀌었으면 번역 상태 초기화 후 자동번역 시도(연결 안 되어 있으면 null)
    const auto = await translateToKorean(original, lang);
    if (auto) { korean = auto; translationStatus = 'auto'; }
    else { korean = ''; translationStatus = 'none'; }
  }

  return {
    original, lang, korean, translationStatus,
    reviewed: preserve ? (existing?.reviewed ?? false) : false,
    updatedAt: now(),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardSupplierRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const db = getDb();
  const lang: Lang = (['ko', 'zh', 'en'].includes(body.lang) ? body.lang : project.default_language) as Lang;
  const existingRow = db.prepare('SELECT * FROM supplier_form_responses WHERE project_id=?').get(project.id) as Record<string, unknown> | undefined;
  const existingData: Record<string, TranslatableValue> = existingRow ? JSON.parse((existingRow.data_json as string) || '{}') : {};

  const incoming = (body.formData || {}) as Record<string, string>;
  const nextData: Record<string, TranslatableValue> = { ...existingData };
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value !== 'string') continue;
    nextData[key] = await buildTranslatableValue(key, value, lang, existingData[key]);
  }

  const converterType = typeof body.converterType === 'string' ? body.converterType : (existingRow?.converter_type as string | null) ?? null;
  const testCategories = Array.isArray(body.testCategories) ? body.testCategories : JSON.parse((existingRow?.test_categories_json as string) || '[]');
  const derivedChangeChecks = body.derivedChangeChecks && typeof body.derivedChangeChecks === 'object'
    ? body.derivedChangeChecks : JSON.parse((existingRow?.derived_change_checks_json as string) || '{}');
  const ts = now();

  if (existingRow) {
    db.prepare(`UPDATE supplier_form_responses SET converter_type=?, test_categories_json=?, derived_change_checks_json=?, data_json=?, version=version+1, updated_at=? WHERE project_id=?`)
      .run(converterType, JSON.stringify(testCategories), JSON.stringify(derivedChangeChecks), JSON.stringify(nextData), ts, project.id);
  } else {
    db.prepare(`INSERT INTO supplier_form_responses (id, project_id, converter_type, test_categories_json, derived_change_checks_json, data_json, hidden_data_json, version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '{}', 1, ?)`).run(newId(), project.id, converterType, JSON.stringify(testCategories), JSON.stringify(derivedChangeChecks), JSON.stringify(nextData), ts);
  }

  // 제출됨/재제출됨 상태에서 다시 저장을 시작하면 "수정중"으로 전이
  if (project.status === 'submitted' || project.status === 'resubmitted') {
    db.prepare(`UPDATE supplier_request_projects SET status='editing', updated_at=? WHERE id=?`).run(ts, project.id);
  }

  writeAuditLog({
    projectId: project.id, action: 'draft_save', actorType: 'external', actorTokenHash: null,
    req, after: { fields: Object.keys(incoming), converterType },
  });

  return NextResponse.json({ data: { savedAt: ts } });
}
