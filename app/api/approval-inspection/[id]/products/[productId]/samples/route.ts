import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id, projectId: row.project_id, productId: row.product_id, sampleNo: row.sample_no,
    samplingMethod: row.sampling_method, inspectionDate: row.inspection_date, inspectionPlace: row.inspection_place,
    inspector: row.inspector, remark: row.remark, sortOrder: row.sort_order,
  };
}

async function assertEditable(db: ReturnType<typeof getDb>, projectId: string, productId: string) {
  const project = db.prepare('SELECT status FROM approval_inspection_projects WHERE id=? AND deleted=0').get(projectId) as { status: string } | undefined;
  if (!project) return { error: NextResponse.json({ error: '없음' }, { status: 404 }) };
  if (project.status === 'closed') return { error: NextResponse.json({ error: '마감된 프로젝트는 수정할 수 없습니다.' }, { status: 423 }) };
  const product = db.prepare('SELECT id FROM approval_inspection_products WHERE id=? AND project_id=? AND deleted=0').get(productId, projectId);
  if (!product) return { error: NextResponse.json({ error: '없음' }, { status: 404 }) };
  return { error: null };
}

/** §12 샘플별 측정값 + 항목별 평균/최소/최대 — 저장하지 않고 조회 시 계산해서
 * 샘플이 추가/삭제돼도 항상 최신 반영되게 한다. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const samples = db.prepare('SELECT * FROM approval_inspection_samples WHERE project_id=? AND product_id=? ORDER BY sort_order').all(id, productId) as Record<string, unknown>[];
  const sampleIds = samples.map(s => s.id as string);
  const measurementsBySample: Record<string, Record<string, unknown>[]> = {};
  if (sampleIds.length > 0) {
    const placeholders = sampleIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM approval_inspection_sample_measurements WHERE sample_id IN (${placeholders})`).all(...sampleIds) as Record<string, unknown>[];
    for (const r of rows) {
      const sid = r.sample_id as string;
      (measurementsBySample[sid] ??= []).push({ id: r.id, itemKey: r.item_key, itemLabel: r.item_label, measuredValue: r.measured_value, unit: r.unit, judgement: r.judgement });
    }
  }

  const stats: Record<string, { itemLabel: string; unit: string | null; avg: number | null; min: number | null; max: number | null; count: number }> = {};
  for (const list of Object.values(measurementsBySample)) {
    for (const m of list) {
      const key = m.itemKey as string;
      const n = Number(m.measuredValue);
      if (!stats[key]) stats[key] = { itemLabel: m.itemLabel as string, unit: m.unit as string | null, avg: null, min: null, max: null, count: 0 };
      if (m.measuredValue != null && Number.isFinite(n)) {
        const s = stats[key];
        s.count += 1;
        s.min = s.min == null ? n : Math.min(s.min, n);
        s.max = s.max == null ? n : Math.max(s.max, n);
        s.avg = s.avg == null ? n : s.avg + n;
      }
    }
  }
  for (const s of Object.values(stats)) { if (s.count > 0 && s.avg != null) s.avg = s.avg / s.count; }

  return NextResponse.json({
    data: samples.map(s => ({ ...toClient(s), measurements: measurementsBySample[s.id as string] || [] })),
    stats,
  });
}

/** §12 샘플 추가 — 제품의 현재 측정항목(표준+커스텀 포함) 목록으로 빈 측정값 행을
 * 자동 생성한다. 샘플 수를 1개로 고정하지 않고 검사자가 필요한 만큼 추가한다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id, productId } = await params;
  const db = getDb();
  const gate = await assertEditable(db, id, productId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM approval_inspection_samples WHERE product_id=?').get(productId) as { m: number | null }).m;
  const nextIdx = (maxOrder ?? -1) + 2;
  const ts = now();
  const sampleId = newId();

  db.transaction(() => {
    db.prepare(`INSERT INTO approval_inspection_samples
      (id, project_id, product_id, sample_no, sampling_method, inspection_date, inspection_place, inspector, remark, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      sampleId, id, productId, body.sampleNo || `S${nextIdx}`, body.samplingMethod ?? null, body.inspectionDate ?? null,
      body.inspectionPlace ?? null, body.inspector ?? null, body.remark ?? null, (maxOrder ?? -1) + 1, ts, ts,
    );
    const items = db.prepare('SELECT item_key, item_label, measured_unit FROM approval_inspection_measurements WHERE product_id=? ORDER BY sort_order').all(productId) as { item_key: string; item_label: string; measured_unit: string | null }[];
    const insertSm = db.prepare('INSERT INTO approval_inspection_sample_measurements (id, sample_id, item_key, item_label, measured_value, unit, judgement, created_at) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)');
    items.forEach(it => insertSm.run(newId(), sampleId, it.item_key, it.item_label, it.measured_unit, ts));
  })();

  writeInspectionAuditLog({ projectId: id, action: 'sample_create', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, after: body, req });
  const row = db.prepare('SELECT * FROM approval_inspection_samples WHERE id=?').get(sampleId) as Record<string, unknown>;
  return NextResponse.json({ data: toClient(row) }, { status: 201 });
}
