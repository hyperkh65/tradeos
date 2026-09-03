import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { hasUnacknowledgedBlockingIssues } from '@/lib/approval-inspection/validate';
import { UPLOAD_BASE } from '@/lib/approval-inspection/storage';
import { buildInspectionDocx } from '@/lib/approval-inspection/docx-build';
import type { InspectionDocMeta, DocProduct, DocPhoto } from '@/lib/approval-inspection/docx-build';
import { buildInspectionXlsx } from '@/lib/approval-inspection/xlsx-build';
import type ExcelJS from 'exceljs';
import { convertDocxToPdf, withTempDir } from '@/lib/approval-doc/libreoffice-convert';
import { nasUpload, buildNasPath } from '@/lib/storage/nas';
import { REPORT_TYPE_TITLE, FINAL_DECISION_OPTIONS } from '@/lib/approval-inspection/types';
import type { Lang, ReportType } from '@/lib/approval-inspection/types';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/** 프로젝트의 제품/측정항목/배선정보/사진(diffs는 출고선적승인서에만)을 문서
 * 빌더가 바로 쓸 수 있는 형태로 조립한다. 사진은 편집본(edited_file_path)이
 * 있으면 그걸, 없으면 원본을 읽어 PNG 버퍼로 통일한다. */
async function buildProductsForDoc(projectId: string, reportType: ReportType): Promise<DocProduct[]> {
  const db = getDb();
  const products = db.prepare('SELECT * FROM approval_inspection_products WHERE project_id=? AND deleted=0 ORDER BY sort_order').all(projectId) as Record<string, unknown>[];

  const out: DocProduct[] = [];
  for (const p of products) {
    const productId = p.id as string;
    const measurements = db.prepare('SELECT * FROM approval_inspection_measurements WHERE product_id=? ORDER BY sort_order').all(productId) as Record<string, unknown>[];
    const wireSpecs = db.prepare('SELECT * FROM approval_inspection_wire_specs WHERE product_id=? ORDER BY wire_role, sort_order').all(productId) as Record<string, unknown>[];
    const photoRows = db.prepare('SELECT * FROM approval_inspection_photos WHERE product_id=? AND is_current=1 ORDER BY category_key, sort_order').all(productId) as Record<string, unknown>[];
    const diffRows = reportType === 'pre_shipment'
      ? db.prepare('SELECT * FROM approval_inspection_diffs WHERE product_id=? ORDER BY sort_order').all(productId) as Record<string, unknown>[]
      : [];

    const photos: DocPhoto[] = [];
    for (const ph of photoRows) {
      const filePath = ph.edited_file_path
        ? String(ph.edited_file_path)
        : path.join(UPLOAD_BASE, projectId, String(ph.id), String(ph.stored_filename));
      if (!fs.existsSync(filePath)) continue;
      try {
        let buf = fs.readFileSync(filePath);
        if (!/\.png$/i.test(filePath)) buf = await sharp(buf).png().toBuffer();
        const meta = await sharp(buf).metadata();
        if (!meta.width || !meta.height) continue;
        photos.push({ categoryKey: String(ph.category_key), label: String(ph.category_key), buffer: buf, width: meta.width, height: meta.height });
      } catch { /* 손상된 이미지는 건너뛴다(문서 생성 자체를 막지 않음) */ }
    }

    out.push({
      productName: (p.product_name as string) || undefined,
      modelName: (p.model_name as string) || undefined,
      manufacturer: (p.manufacturer as string) || undefined,
      productionLot: (p.production_lot as string) || undefined,
      certNumber: (p.cert_number as string) || undefined,
      dimensions: (p.dimensions as string) || undefined,
      weightG: p.weight_g != null ? String(p.weight_g) : undefined,
      overallJudgement: (p.overall_judgement as string) || undefined,
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
      photos,
      diffs: diffRows.map(d => ({
        compareItem: d.compare_item as string, judgement: (d.judgement as string) || undefined, changeLocation: (d.change_location as string) || undefined,
        beforeDesc: (d.before_desc as string) || undefined, afterDesc: (d.after_desc as string) || undefined, reason: (d.reason as string) || undefined,
        needsApproval: !!d.needs_approval,
      })),
    });
  }
  return out;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as Record<string, unknown> | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const products = db.prepare('SELECT id FROM approval_inspection_products WHERE project_id=? AND deleted=0').all(id) as { id: string }[];
  if (products.length === 0) return NextResponse.json({ error: '제품 정보를 최소 1개 이상 등록해야 문서를 생성할 수 있습니다.' }, { status: 400 });

  const { blocked, issues } = hasUnacknowledgedBlockingIssues(id);
  if (blocked) {
    return NextResponse.json({ error: '측정값에 확인되지 않은 오류가 있어 문서를 생성할 수 없습니다.', issues: issues.filter(i => i.severity === 'blocking') }, { status: 400 });
  }

  const reportType = project.report_type as ReportType;
  const lang = (project.default_language as Lang) || 'zh';
  const docTitle = (project.title_override as string) || REPORT_TYPE_TITLE[reportType][lang];

  const meta: InspectionDocMeta = {
    businessId: project.business_id as string, reportType, title: docTitle, projectName: project.project_name as string,
    customerName: (project.customer_name as string) || undefined, supplierName: (project.supplier_name as string) || undefined,
    manufacturerName: (project.manufacturer_name as string) || undefined, poNumber: (project.po_number as string) || undefined,
    piNumber: (project.pi_number as string) || undefined, productionLotNo: (project.production_lot_no as string) || undefined,
    dueDate: (project.due_date as string) || undefined, issueDate: now().slice(0, 10),
    finalDecision: (project.final_decision as string) || undefined, decidedByName: (project.decided_by_name as string) || undefined,
    decidedAt: (project.decided_at as string) || undefined,
  };

  const docProducts = await buildProductsForDoc(id, reportType);

  let docxBuffer: Buffer;
  let xlsxBuffer: ExcelJS.Buffer;
  try {
    docxBuffer = await buildInspectionDocx({ meta, products: docProducts }, FINAL_DECISION_OPTIONS[reportType]);
    xlsxBuffer = await buildInspectionXlsx({ meta, products: docProducts });
  } catch (e) {
    console.error('[approval-inspection generate]', e);
    return NextResponse.json({ error: `문서 생성 실패: ${(e as Error).message}` }, { status: 500 });
  }

  let pdfBuffer: Buffer | null = null;
  await withTempDir('inspection-gen-', async dir => {
    const docxPath = path.join(dir, 'doc.docx');
    fs.writeFileSync(docxPath, docxBuffer);
    pdfBuffer = await convertDocxToPdf(docxPath);
  });

  const ts = now();
  const businessId = project.business_id as string;
  const docxFileName = `${businessId}.docx`;
  const pdfFileName = `${businessId}.pdf`;
  const xlsxFileName = `${businessId}.xlsx`;
  const docxUpload = await nasUpload(buildNasPath('approval-inspection', businessId, docxFileName), docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const xlsxUpload = await nasUpload(buildNasPath('approval-inspection', businessId, xlsxFileName), Buffer.from(xlsxBuffer), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const pdfUpload = pdfBuffer
    ? await nasUpload(buildNasPath('approval-inspection', businessId, pdfFileName), pdfBuffer, 'application/pdf')
    : null;

  db.transaction(() => {
    db.prepare('UPDATE approval_inspection_generated_documents SET is_final=0 WHERE project_id=?').run(id);
    if (docxUpload.success) {
      db.prepare(`INSERT INTO approval_inspection_generated_documents (id, project_id, file_type, stored_path, generated_by, generated_by_name, generated_at, is_final)
        VALUES (?, ?, 'docx', ?, ?, ?, ?, 1)`).run(newId(), id, docxUpload.path, user.id, user.name, ts);
    }
    if (xlsxUpload.success) {
      db.prepare(`INSERT INTO approval_inspection_generated_documents (id, project_id, file_type, stored_path, generated_by, generated_by_name, generated_at, is_final)
        VALUES (?, ?, 'xlsx', ?, ?, ?, ?, 1)`).run(newId(), id, xlsxUpload.path, user.id, user.name, ts);
    }
    if (pdfUpload?.success) {
      db.prepare(`INSERT INTO approval_inspection_generated_documents (id, project_id, file_type, stored_path, generated_by, generated_by_name, generated_at, is_final)
        VALUES (?, ?, 'pdf', ?, ?, ?, ?, 1)`).run(newId(), id, pdfUpload.path, user.id, user.name, ts);
    }
  })();

  writeInspectionAuditLog({
    projectId: id, action: 'generate_docx', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req,
    after: { productCount: docProducts.length, hasPdf: !!pdfBuffer },
  });

  return NextResponse.json({
    data: {
      productCount: docProducts.length,
      hasPdf: !!pdfBuffer,
      warning: pdfBuffer ? null : 'PDF 변환 서버(docverify)에 연결할 수 없어 DOCX/XLSX만 생성되었습니다.',
    },
  });
}
