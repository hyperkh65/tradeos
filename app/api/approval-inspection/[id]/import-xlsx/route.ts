import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { parseReferenceInspectionXlsx } from '@/lib/approval-inspection/xlsx-import';
import { STANDARD_MEASUREMENT_ITEMS } from '@/lib/approval-inspection/types';

/** §17 XLSX 가져오기 — 참고 엑셀 형식에서 파싱된 제품마다 새 제품 블록을 만든다(기존
 * 제품을 덮어쓰지 않음, 항상 추가만 함 — 실수로 기존 입력값을 잃지 않게 하기 위함).
 * 각 제품은 표준 측정항목(§6)으로 먼저 시딩한 뒤, 엑셀에서 읽은 값으로 baseline_value만
 * 채운다(측정값은 실제 검사자가 입력해야 하므로 비워둠). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { status: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });
  if (project.status === 'closed') return NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 });

  if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
    return NextResponse.json({ error: '멀티파트 요청만 지원합니다.' }, { status: 400 });
  }
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseReferenceInspectionXlsx(buffer);
  } catch (e) {
    return NextResponse.json({ error: `엑셀 파싱 실패: ${(e as Error).message}` }, { status: 400 });
  }
  if (parsed.products.length === 0) {
    return NextResponse.json({ error: '가져올 제품 데이터를 찾지 못했습니다.', warnings: parsed.warnings }, { status: 400 });
  }

  const ts = now();
  const maxOrderRow = db.prepare('SELECT MAX(sort_order) as m FROM approval_inspection_products WHERE project_id=? AND deleted=0').get(id) as { m: number | null };
  let nextOrder = (maxOrderRow.m ?? -1) + 1;
  const createdProductIds: string[] = [];

  db.transaction(() => {
    for (const p of parsed.products) {
      const productId = newId();
      db.prepare(`INSERT INTO approval_inspection_products
        (id, project_id, sort_order, product_name, model_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(productId, id, nextOrder++, p.productName, p.modelName, ts, ts);

      const valueByKey = new Map(p.measurements.map(m => [m.itemKey, m]));
      const insertMeasurement = db.prepare(`INSERT INTO approval_inspection_measurements
        (id, project_id, product_id, item_key, item_label, baseline_value, baseline_unit, measured_unit, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      STANDARD_MEASUREMENT_ITEMS.forEach((item, idx) => {
        const found = valueByKey.get(item.key);
        insertMeasurement.run(newId(), id, productId, item.key, item.label, found?.value ?? null, found?.unit || item.unit, item.unit, idx, ts, ts);
      });
      createdProductIds.push(productId);
    }
  })();

  writeInspectionAuditLog({
    projectId: id, action: 'product_create', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req,
    after: { source: 'xlsx_import', count: createdProductIds.length },
  });

  return NextResponse.json({ data: { importedCount: createdProductIds.length, warnings: parsed.warnings } });
}
