import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';

function projectToClient(row: Record<string, unknown>) {
  return {
    id: row.id, businessId: row.business_id, productName: row.product_name,
    internalRefNo: row.internal_ref_no, supplierName: row.supplier_name, contactPerson: row.contact_person,
    requestedAt: row.requested_at, dueDate: row.due_date, memo: row.memo,
    defaultLanguage: row.default_language, status: row.status, templateVersion: row.template_version,
    createdBy: row.created_by, createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();

  const project = db.prepare('SELECT * FROM supplier_request_projects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 });

  const activeLink = db.prepare('SELECT id, created_at FROM supplier_request_links WHERE project_id=? AND is_active=1').get(id) as { id: string; created_at: string } | undefined;
  const response = db.prepare('SELECT * FROM supplier_form_responses WHERE project_id=?').get(id) as Record<string, unknown> | undefined;
  const componentItems = db.prepare('SELECT * FROM supplier_component_items WHERE project_id=? AND deleted=0 ORDER BY list_type, sort_order').all(id) as Record<string, unknown>[];
  const attachments = db.prepare('SELECT * FROM supplier_attachments WHERE project_id=? AND is_current=1 ORDER BY category_key, created_at').all(id) as Record<string, unknown>[];
  const submissionVersions = db.prepare('SELECT id, version_no, submitted_at, submitted_by_name, status_at_submission FROM supplier_submission_versions WHERE project_id=? ORDER BY version_no DESC').all(id) as Record<string, unknown>[];
  const closures = db.prepare('SELECT id, closed_by_user_name, closed_at, submission_version_at_closure, reason_memo, reopened_at, reopened_by_user_name, reopen_reason FROM supplier_closure_snapshots WHERE project_id=? ORDER BY closed_at DESC').all(id) as Record<string, unknown>[];

  return NextResponse.json({
    data: {
      project: projectToClient(project),
      hasActiveLink: !!activeLink,
      linkCreatedAt: activeLink?.created_at ?? null,
      converterType: response?.converter_type ?? null,
      formData: response ? JSON.parse((response.data_json as string) || '{}') : {},
      componentItems: componentItems.map(c => ({
        id: c.id, listType: c.list_type, rowKey: c.row_key, sortOrder: c.sort_order,
        partName: c.part_name, modelName: c.model_name, specText: c.spec_text, material: c.material,
        widthMm: c.width_mm, depthMm: c.depth_mm, heightMm: c.height_mm, qty: c.qty, manufacturer: c.manufacturer, remark: c.remark,
        original: JSON.parse((c.original_json as string) || '{}'), korean: JSON.parse((c.korean_json as string) || '{}'),
      })),
      attachments: attachments.map(a => ({
        id: a.id, categoryKey: a.category_key, originalFilename: a.original_filename, sizeBytes: a.size_bytes,
        mimeType: a.mime_type, description: a.description, version: a.version, uploadedBy: a.uploaded_by,
        uploadedByName: a.uploaded_by_name, submissionVersion: a.submission_version, createdAt: a.created_at,
      })),
      submissionVersions: submissionVersions.map(v => ({
        id: v.id, versionNo: v.version_no, submittedAt: v.submitted_at, submittedByName: v.submitted_by_name, status: v.status_at_submission,
      })),
      closures: closures.map(c => ({
        id: c.id, closedByUserName: c.closed_by_user_name, closedAt: c.closed_at, submissionVersion: c.submission_version_at_closure,
        reasonMemo: c.reason_memo, reopenedAt: c.reopened_at, reopenedByUserName: c.reopened_by_user_name, reopenReason: c.reopen_reason,
      })),
    },
  });
}
