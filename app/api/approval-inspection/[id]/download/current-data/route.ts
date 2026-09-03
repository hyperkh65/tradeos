import { NextRequest, NextResponse } from 'next/server';
import { getDb, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { buildInspectionXlsx } from '@/lib/approval-inspection/xlsx-build';
import type { InspectionDocMeta, DocProduct } from '@/lib/approval-inspection/docx-build';
import { REPORT_TYPE_TITLE } from '@/lib/approval-inspection/types';
import type { Lang, ReportType } from '@/lib/approval-inspection/types';

/** §17 "현재 데이터 다운로드" — /generate(NAS 업로드+PDF 변환 포함)와 달리 최종본
 * 생성 없이 지금 입력된 값을 바로 XLSX로 내려받기만 한다(작성 중간 점검용). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as Record<string, unknown> | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const reportType = project.report_type as ReportType;
  const lang = (project.default_language as Lang) || 'zh';
  const meta: InspectionDocMeta = {
    businessId: project.business_id as string, reportType, title: (project.title_override as string) || REPORT_TYPE_TITLE[reportType][lang],
    projectName: project.project_name as string, customerName: (project.customer_name as string) || undefined,
    supplierName: (project.supplier_name as string) || undefined, manufacturerName: (project.manufacturer_name as string) || undefined,
    poNumber: (project.po_number as string) || undefined, piNumber: (project.pi_number as string) || undefined,
    productionLotNo: (project.production_lot_no as string) || undefined, dueDate: (project.due_date as string) || undefined, issueDate: now().slice(0, 10),
  };

  const products = db.prepare('SELECT id FROM approval_inspection_products WHERE project_id=? AND deleted=0 ORDER BY sort_order').all(id) as { id: string }[];
  const docProducts: DocProduct[] = products.map(p => {
    const measurements = db.prepare('SELECT * FROM approval_inspection_measurements WHERE product_id=? ORDER BY sort_order').all(p.id) as Record<string, unknown>[];
    const wireSpecs = db.prepare('SELECT * FROM approval_inspection_wire_specs WHERE product_id=? ORDER BY wire_role, sort_order').all(p.id) as Record<string, unknown>[];
    const prodRow = db.prepare('SELECT * FROM approval_inspection_products WHERE id=?').get(p.id) as Record<string, unknown>;
    return {
      productName: (prodRow.product_name as string) || undefined, modelName: (prodRow.model_name as string) || undefined,
      manufacturer: (prodRow.manufacturer as string) || undefined, productionLot: (prodRow.production_lot as string) || undefined,
      certNumber: (prodRow.cert_number as string) || undefined, dimensions: (prodRow.dimensions as string) || undefined,
      weightG: prodRow.weight_g != null ? String(prodRow.weight_g) : undefined,
      measurements: measurements.map(m => ({
        itemLabel: m.item_label as string, baselineValue: (m.baseline_value as string) || undefined, baselineUnit: (m.baseline_unit as string) || undefined,
        measuredValue: (m.measured_value as string) || undefined, measuredUnit: (m.measured_unit as string) || undefined,
        minValue: (m.min_value as string) || undefined, maxValue: (m.max_value as string) || undefined, judgement: (m.judgement as string) || undefined,
      })),
      wireSpecs: wireSpecs.map(w => ({
        wireRole: w.wire_role as 'input' | 'output', wireSpec: (w.wire_spec as string) || undefined, conductorArea: (w.conductor_area as string) || undefined,
        baselineLengthValue: (w.baseline_length_value as string) || undefined, baselineLengthUnit: (w.baseline_length_unit as string) || undefined,
        measuredLengthValue: (w.measured_length_value as string) || undefined, measuredLengthUnit: (w.measured_length_unit as string) || undefined,
        connectorModel: (w.connector_model as string) || undefined,
      })),
      photos: [], diffs: [],
    };
  });

  const buf = await buildInspectionXlsx({ meta, products: docProducts });
  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${meta.businessId}_current.xlsx"`,
    },
  });
}
