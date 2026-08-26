import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { generateSupplierFormDocx, type ComponentItemInput, type AttachmentInput } from '@/lib/supplier-form/docx-generate';
import { writeAuditLog } from '@/lib/supplier-form/audit';
import type { ConverterType, TranslatableValue } from '@/lib/supplier-form/field-schema';
import path from 'path';

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/supplier-requests'
  : path.join(process.cwd(), 'data/uploads/supplier-requests');

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const project = db.prepare('SELECT * FROM supplier_request_projects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 });

  const source = new URL(req.url).searchParams.get('source') || 'current'; // current | latest_submission | closure | version:<versionNo>

  let converterType: ConverterType | null = null;
  let testCategories: string[] = [];
  let derivedChangeChecks: Record<string, boolean> = {};
  let formData: Record<string, TranslatableValue> = {};
  let componentItems: ComponentItemInput[] = [];
  let attachmentRows: Record<string, unknown>[] = [];

  if (source === 'closure') {
    const closure = db.prepare('SELECT * FROM supplier_closure_snapshots WHERE project_id=? ORDER BY closed_at DESC LIMIT 1').get(id) as Record<string, unknown> | undefined;
    if (!closure) return NextResponse.json({ error: '마감 스냅샷이 없습니다' }, { status: 404 });
    const snap = JSON.parse(closure.data_snapshot_json as string);
    converterType = snap.converterType; testCategories = snap.testCategories || []; formData = snap.formData || {};
    componentItems = snap.componentItems || [];
    attachmentRows = JSON.parse(closure.attachments_snapshot_json as string) || [];
  } else if (source.startsWith('version:') || source === 'latest_submission') {
    const versionNo = source.startsWith('version:') ? Number(source.split(':')[1]) : null;
    const versionRow = versionNo
      ? db.prepare('SELECT * FROM supplier_submission_versions WHERE project_id=? AND version_no=?').get(id, versionNo) as Record<string, unknown> | undefined
      : db.prepare('SELECT * FROM supplier_submission_versions WHERE project_id=? ORDER BY version_no DESC LIMIT 1').get(id) as Record<string, unknown> | undefined;
    if (!versionRow) return NextResponse.json({ error: '제출 이력이 없습니다' }, { status: 404 });
    const snap = JSON.parse(versionRow.data_snapshot_json as string);
    converterType = snap.converterType; testCategories = snap.testCategories || []; formData = snap.formData || {};
    componentItems = snap.componentItems || [];
    attachmentRows = JSON.parse(versionRow.attachments_snapshot_json as string) || [];
  } else {
    const response = db.prepare('SELECT * FROM supplier_form_responses WHERE project_id=?').get(id) as Record<string, unknown> | undefined;
    converterType = (response?.converter_type as ConverterType) ?? null;
    testCategories = response ? JSON.parse((response.test_categories_json as string) || '[]') : [];
    derivedChangeChecks = response ? JSON.parse((response.derived_change_checks_json as string) || '{}') : {};
    formData = response ? JSON.parse((response.data_json as string) || '{}') : {};
    componentItems = (db.prepare('SELECT * FROM supplier_component_items WHERE project_id=? AND deleted=0').all(id) as Record<string, unknown>[])
      .map(c => ({
        listType: c.list_type as string, rowKey: c.row_key as string | null, partName: c.part_name as string | null,
        modelName: c.model_name as string | null, specText: c.spec_text as string | null, material: c.material as string | null,
        widthMm: c.width_mm as string | null, depthMm: c.depth_mm as string | null, heightMm: c.height_mm as string | null,
        qty: c.qty as string | null, manufacturer: c.manufacturer as string | null, remark: c.remark as string | null,
      }));
    attachmentRows = db.prepare('SELECT * FROM supplier_attachments WHERE project_id=? AND is_current=1').all(id) as Record<string, unknown>[];
  }

  const attachments: AttachmentInput[] = attachmentRows
    .map((a): AttachmentInput | null => {
      const attId = (a.id ?? a.attachmentId) as string;
      const storedFilename = (a.stored_filename ?? a.storedFilename) as string;
      const categoryKey = (a.category_key ?? a.categoryKey) as string;
      if (!attId || !storedFilename) return null;
      return { categoryKey, absolutePath: path.join(UPLOAD_BASE, id, attId, storedFilename), imagePageSelection: 1 };
    })
    .filter((a): a is AttachmentInput => a !== null);

  try {
    const buf = await generateSupplierFormDocx({
      templateVersion: (project.template_version as string) || 'v1',
      converterType, testCategories, derivedChangeChecks, formData, componentItems, attachments,
    });

    writeAuditLog({ projectId: id, action: 'download_docx', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req, after: { source } });

    const filename = `${project.business_id}_${project.supplier_name}_${source}.docx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    console.error('[supplier-requests docx]', e);
    return NextResponse.json({ error: 'DOCX 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
