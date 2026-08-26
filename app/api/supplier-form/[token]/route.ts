import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { guardSupplierRequest } from '@/lib/supplier-form/token';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guard = guardSupplierRequest(token, false); // 조회는 마감 상태에서도 허용(읽기전용 표시)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const db = getDb();
  const { project } = guard;
  const response = db.prepare('SELECT * FROM supplier_form_responses WHERE project_id=?').get(project.id) as Record<string, unknown> | undefined;
  const componentItems = db.prepare('SELECT * FROM supplier_component_items WHERE project_id=? AND deleted=0 ORDER BY list_type, sort_order').all(project.id) as Record<string, unknown>[];
  const attachments = db.prepare('SELECT * FROM supplier_attachments WHERE project_id=? AND is_current=1 ORDER BY category_key, created_at').all(project.id) as Record<string, unknown>[];

  return NextResponse.json({
    data: {
      project: {
        productName: project.product_name, supplierName: project.supplier_name,
        dueDate: project.due_date, defaultLanguage: project.default_language,
        status: project.status, templateVersion: project.template_version,
      },
      converterType: response?.converter_type ?? null,
      formData: response ? JSON.parse((response.data_json as string) || '{}') : {},
      componentItems: componentItems.map(c => ({
        id: c.id, listType: c.list_type, rowKey: c.row_key, sortOrder: c.sort_order,
        partName: c.part_name, modelName: c.model_name, specText: c.spec_text, material: c.material,
        widthMm: c.width_mm, depthMm: c.depth_mm, heightMm: c.height_mm, qty: c.qty, manufacturer: c.manufacturer, remark: c.remark,
        original: JSON.parse((c.original_json as string) || '{}'),
      })),
      attachments: attachments.map(a => ({
        id: a.id, categoryKey: a.category_key, originalFilename: a.original_filename, sizeBytes: a.size_bytes,
        mimeType: a.mime_type, description: a.description, version: a.version, createdAt: a.created_at,
      })),
    },
  });
}
