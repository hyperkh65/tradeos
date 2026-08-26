import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { generateSupplierFormXlsx } from '@/lib/supplier-form/xlsx-generate';
import { writeAuditLog } from '@/lib/supplier-form/audit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const project = db.prepare('SELECT * FROM supplier_request_projects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 });

  const response = db.prepare('SELECT * FROM supplier_form_responses WHERE project_id=?').get(id) as Record<string, unknown> | undefined;
  const componentItems = (db.prepare('SELECT * FROM supplier_component_items WHERE project_id=? AND deleted=0 ORDER BY list_type, sort_order').all(id) as Record<string, unknown>[])
    .map(c => ({
      listType: c.list_type as string, rowKey: c.row_key as string | null, partName: c.part_name as string | null,
      modelName: c.model_name as string | null, specText: c.spec_text as string | null, material: c.material as string | null,
      widthMm: c.width_mm as string | null, depthMm: c.depth_mm as string | null, heightMm: c.height_mm as string | null,
      qty: c.qty as string | null, manufacturer: c.manufacturer as string | null, remark: c.remark as string | null,
    }));
  const attachments = (db.prepare('SELECT * FROM supplier_attachments WHERE project_id=? ORDER BY category_key, created_at').all(id) as Record<string, unknown>[])
    .map(a => ({
      categoryKey: a.category_key as string, originalFilename: a.original_filename as string, sizeBytes: a.size_bytes as number,
      createdAt: a.created_at as string, version: a.version as number, submissionVersion: a.submission_version as number,
      isCurrent: !!a.is_current,
    }));
  const submissionVersions = (db.prepare('SELECT * FROM supplier_submission_versions WHERE project_id=? ORDER BY version_no').all(id) as Record<string, unknown>[])
    .map(v => ({ versionNo: v.version_no as number, submittedAt: v.submitted_at as string, submittedByName: v.submitted_by_name as string, status: v.status_at_submission as string }));
  const closures = (db.prepare('SELECT * FROM supplier_closure_snapshots WHERE project_id=? ORDER BY closed_at').all(id) as Record<string, unknown>[])
    .map(c => ({ closedByUserName: c.closed_by_user_name as string, closedAt: c.closed_at as string, reasonMemo: c.reason_memo as string | null, reopenedAt: c.reopened_at as string | null, reopenedByUserName: c.reopened_by_user_name as string | null }));

  try {
    const buf = await generateSupplierFormXlsx({
      project: {
        businessId: project.business_id as string, productName: project.product_name as string, internalRefNo: project.internal_ref_no as string | null,
        supplierName: project.supplier_name as string, contactPerson: project.contact_person as string | null,
        requestedAt: project.requested_at as string | null, dueDate: project.due_date as string | null,
        status: project.status as string, createdByName: project.created_by_name as string | null,
      },
      converterType: (response?.converter_type as string) ?? null,
      formData: response ? JSON.parse((response.data_json as string) || '{}') : {},
      componentItems, attachments, submissionVersions, closures,
    });

    writeAuditLog({ projectId: id, action: 'download_xlsx', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req });

    const filename = `${project.business_id}_${project.supplier_name}.xlsx`;
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    console.error('[supplier-requests xlsx]', e);
    return NextResponse.json({ error: 'XLSX 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
