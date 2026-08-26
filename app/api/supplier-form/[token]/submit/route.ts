import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { guardSupplierRequest } from '@/lib/supplier-form/token';
import { writeAuditLog } from '@/lib/supplier-form/audit';
import { validateSubmission } from '@/lib/supplier-form/validate';
import { createNotification } from '@/lib/notifications';
import type { ConverterType, TranslatableValue } from '@/lib/supplier-form/field-schema';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardSupplierRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { project } = guard;

  const body = await req.json().catch(() => ({}));
  const submitterName = (body.submitterName || '').trim();
  if (!submitterName) return NextResponse.json({ error: '제출자 이름을 입력해주세요.' }, { status: 400 });

  const db = getDb();
  const response = db.prepare('SELECT * FROM supplier_form_responses WHERE project_id=?').get(project.id) as Record<string, unknown> | undefined;
  const componentItems = db.prepare('SELECT * FROM supplier_component_items WHERE project_id=? AND deleted=0').all(project.id) as Record<string, unknown>[];
  const attachments = db.prepare('SELECT * FROM supplier_attachments WHERE project_id=? AND is_current=1').all(project.id) as Record<string, unknown>[];

  const converterType = (response?.converter_type as ConverterType | null) ?? null;
  const testCategories: string[] = response ? JSON.parse((response.test_categories_json as string) || '[]') : [];
  const formData: Record<string, TranslatableValue> = response ? JSON.parse((response.data_json as string) || '{}') : {};
  const categoryKeysPresent = new Set(attachments.map(a => a.category_key as string));

  const result = validateSubmission(
    converterType, testCategories, formData,
    componentItems.map(c => ({
      listType: c.list_type as string, rowKey: c.row_key as string | null, modelName: c.model_name as string | null,
      manufacturer: c.manufacturer as string | null, material: c.material as string | null,
      widthMm: c.width_mm as string | null, depthMm: c.depth_mm as string | null, heightMm: c.height_mm as string | null,
    })),
    categoryKeysPresent,
  );

  if (!result.valid) {
    return NextResponse.json({ error: '누락된 항목이 있습니다.', issues: result.issues }, { status: 400 });
  }

  const versionRow = db.prepare('SELECT MAX(version_no) as v FROM supplier_submission_versions WHERE project_id=?').get(project.id) as { v: number | null };
  const versionNo = (versionRow.v ?? 0) + 1;
  const isResubmit = versionNo > 1;
  const nextStatus = isResubmit ? 'resubmitted' : 'submitted';
  const ts = now();

  const dataSnapshot = { converterType, testCategories, formData, componentItems };

  db.transaction(() => {
    db.prepare(`INSERT INTO supplier_submission_versions
      (id, project_id, version_no, submitted_at, submitted_by_name, status_at_submission, data_snapshot_json, attachments_snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      newId(), project.id, versionNo, ts, submitterName, nextStatus, JSON.stringify(dataSnapshot), JSON.stringify(attachments), ts,
    );
    db.prepare(`UPDATE supplier_request_projects SET status=?, updated_at=? WHERE id=?`).run(nextStatus, ts, project.id);
    db.prepare(`UPDATE supplier_attachments SET submission_version=? WHERE project_id=? AND is_current=1`).run(versionNo, project.id);
  })();

  writeAuditLog({
    projectId: project.id, action: isResubmit ? 'resubmit' : 'submit', actorType: 'external', req,
    submissionVersion: versionNo, after: { submitterName, versionNo },
  });

  // 그룹웨어 기존 알림 어댑터 호출 (내부 담당자에게 제출 알림)
  if (project.created_by) {
    await createNotification({
      userIds: [project.created_by],
      type: 'supplier_form_submitted',
      title: `[자료제출] ${project.supplier_name} - ${project.product_name}`,
      body: `제출일시: ${ts}\n제출자: ${submitterName}\n제출버전: v${versionNo}${isResubmit ? ' (재제출)' : ''}`,
      link: `/supplier-requests/${project.id}`,
      createdByName: submitterName,
    });
  }

  return NextResponse.json({ data: { status: nextStatus, versionNo } });
}
