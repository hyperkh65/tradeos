import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

/** 고객사/공급업체는 companies 테이블(마스터데이터)에서 가져오지만, 제조업체/제품명은
 * 별도 마스터 테이블이 없어 기존 승인검사 프로젝트/제품에 실제로 입력된 값을 모아
 * 자동완성 목록으로 제공한다. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const db = getDb();

  const manufacturerNames = db.prepare(`
    SELECT DISTINCT name FROM (
      SELECT manufacturer_name AS name FROM approval_inspection_projects WHERE manufacturer_name IS NOT NULL AND TRIM(manufacturer_name) != ''
      UNION
      SELECT manufacturer AS name FROM approval_inspection_products WHERE deleted=0 AND manufacturer IS NOT NULL AND TRIM(manufacturer) != ''
    ) ORDER BY name LIMIT 300
  `).all().map((r: any) => r.name as string);

  const productNames = db.prepare(`
    SELECT DISTINCT name FROM (
      SELECT product_name AS name FROM approval_inspection_projects WHERE product_name IS NOT NULL AND TRIM(product_name) != ''
      UNION
      SELECT product_name AS name FROM approval_inspection_products WHERE deleted=0 AND product_name IS NOT NULL AND TRIM(product_name) != ''
    ) ORDER BY name LIMIT 300
  `).all().map((r: any) => r.name as string);

  return NextResponse.json({ data: { manufacturerNames, productNames } });
}
