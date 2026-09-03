import { getDb, now } from '@/lib/db/sqlite';
import { REPORT_TYPE_TITLE } from './types';
import type { Lang, ReportType } from './types';
import type { InspectionDocMeta, DocProduct } from './docx-build';

/** /download/current-data와 zip-package.ts(06_측정데이터)가 공유하는 조립 로직 —
 * "지금 입력된 값"을 문서 빌더 입력 형태로 바꾸기만 하고 파일로 만들지는 않는다
 * (사진은 포함하지 않음 — ZIP은 사진을 별도 폴더로 이미 담고 있어 XLSX 안에도
 * 중복 삽입하면 파일이 불필요하게 커짐). */
export function buildCurrentDocData(projectId: string): { meta: InspectionDocMeta; products: DocProduct[] } {
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=? AND deleted=0').get(projectId) as Record<string, unknown> | undefined;
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const reportType = project.report_type as ReportType;
  const lang = (project.default_language as Lang) || 'zh';
  const meta: InspectionDocMeta = {
    businessId: project.business_id as string, reportType, title: (project.title_override as string) || REPORT_TYPE_TITLE[reportType][lang],
    projectName: project.project_name as string, customerName: (project.customer_name as string) || undefined,
    supplierName: (project.supplier_name as string) || undefined, manufacturerName: (project.manufacturer_name as string) || undefined,
    poNumber: (project.po_number as string) || undefined, piNumber: (project.pi_number as string) || undefined,
    productionLotNo: (project.production_lot_no as string) || undefined, dueDate: (project.due_date as string) || undefined, issueDate: now().slice(0, 10),
  };

  const products = db.prepare('SELECT id FROM approval_inspection_products WHERE project_id=? AND deleted=0 ORDER BY sort_order').all(projectId) as { id: string }[];
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

  return { meta, products: docProducts };
}
