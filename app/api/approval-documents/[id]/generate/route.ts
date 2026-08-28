import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { generateApprovalDocument } from '@/lib/approval-doc/generate-pipeline';
import { nasUpload, buildNasPath } from '@/lib/storage/nas';
import { TABLE_SECTION_CONFIG, ATTACHMENT_SECTION_CATEGORIES, SCALAR_SECTION_FIELDS } from '@/lib/approval-doc/table-sections';
import { hasUnacknowledgedBlockingIssues } from '@/lib/approval-doc/validate';
import { getTemplate, getBrandProfile } from '@/lib/approval-doc/templates';
import { resolveCompanyAssetPath } from '@/lib/pdf/company';
import { UPLOAD_BASE as BRAND_LOGO_UPLOAD_BASE } from '@/app/api/approval-documents/brand-profiles/[profileId]/logo/route';
import { UPLOAD_BASE as BRAND_WATERMARK_UPLOAD_BASE } from '@/app/api/approval-documents/brand-profiles/[profileId]/watermark/route';
import { rasterizePdfPage } from '@/lib/approval-doc/pdf-page';
import { applyOpacity } from '@/lib/approval-doc/image-edit';
import type { BrandOptions, TemplateOptions } from '@/lib/approval-doc/docx-build';
import type { SectionContent, SectionInstance, BuiltinSectionType } from '@/lib/approval-doc/types';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ATTACHMENT_UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents'
  : path.join(process.cwd(), 'data/uploads/approval-documents');

/** brand-profiles/[id]/logo 업로드 라우트가 저장한 이 시스템 전용 로고는 그 URL 규칙
 * (/api/approval-documents/brand-profiles/{id}/logo/{filename})으로 로컬 경로를 바로
 * 찾고, 그 외(기존 회사설정에서 시드된 값 등)는 기존 resolveCompanyAssetPath로 찾는다. */
function resolveBrandLogoPath(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  const m = logoUrl.match(/\/api\/approval-documents\/brand-profiles\/[^/]+\/logo\/([\w.-]+)$/);
  if (m) return path.join(BRAND_LOGO_UPLOAD_BASE, m[1]);
  return resolveCompanyAssetPath(logoUrl);
}

function resolveBrandWatermarkPath(watermarkUrl: string | null): string | null {
  if (!watermarkUrl) return null;
  const m = watermarkUrl.match(/\/api\/approval-documents\/brand-profiles\/[^/]+\/watermark\/([\w.-]+)$/);
  return m ? path.join(BRAND_WATERMARK_UPLOAD_BASE, m[1]) : null;
}

/** 프로젝트에 지정된 템플릿/브랜드 프로필을 실제 렌더링 가능한 옵션으로 변환한다. */
async function resolveBrandAndTemplate(project: Record<string, unknown>): Promise<{ brand?: BrandOptions; template?: TemplateOptions }> {
  const template = getTemplate(project.template_id as string | null);
  const templateOptions: TemplateOptions | undefined = template ? { baseFont: template.baseFont, headingFont: template.headingFont } : undefined;

  const profile = getBrandProfile(project.brand_profile_id as string | null);
  if (!profile) return { template: templateOptions };

  const brand: BrandOptions = {
    companyName: profile.companyNameKo || profile.companyNameEn || undefined,
    accentColorHex: profile.primaryColor?.replace('#', '') || undefined,
    footerText: profile.footerText || undefined,
  };

  const logoPath = resolveBrandLogoPath(profile.logoUrl);
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      const raw = fs.readFileSync(logoPath);
      // SVG는 docx ImageRun이 직접 지원하지 않으므로 sharp로 래스터화한다(고해상도로).
      const buf = logoPath.toLowerCase().endsWith('.svg') ? await sharp(raw, { density: 300 }).png().toBuffer() : raw;
      const meta = await sharp(buf).metadata();
      if (meta.width && meta.height) {
        const pngBuf = logoPath.toLowerCase().endsWith('.png') || logoPath.toLowerCase().endsWith('.svg') ? buf : await sharp(buf).png().toBuffer();
        brand.logoBuffer = pngBuf;
        brand.logoDimensions = { width: meta.width, height: meta.height };
      }
    } catch (e) {
      console.error('[approval-doc generate] 로고 로드 실패:', e);
    }
  }

  const watermarkPath = resolveBrandWatermarkPath(profile.watermarkUrl);
  if (watermarkPath && fs.existsSync(watermarkPath)) {
    try {
      const raw = fs.readFileSync(watermarkPath);
      const buf = watermarkPath.toLowerCase().endsWith('.svg') ? await sharp(raw, { density: 300 }).png().toBuffer() : raw;
      const opacity = typeof profile.watermarkOpacity === 'number' ? profile.watermarkOpacity : 0.08;
      const translucent = await applyOpacity(buf, opacity);
      const meta = await sharp(translucent).metadata();
      if (meta.width && meta.height) {
        brand.watermarkBuffer = translucent;
        brand.watermarkDimensions = { width: meta.width, height: meta.height };
      }
    } catch (e) {
      console.error('[approval-doc generate] 워터마크 로드 실패:', e);
    }
  }

  return { brand, template: templateOptions };
}

/**
 * 섹션 타입별로 실제 저장된 데이터를 docx-build.ts가 바로 렌더링할 수 있는 SectionContent
 * (문단/표/첨부목록)로 변환한다. 개정이력·일반사양은 전용 테이블, 나머지 표 섹션은
 * table-sections.ts의 TABLE_SECTION_CONFIG를 그대로 따라가는 제네릭 처리라 섹션이
 * 추가되어도 이 함수를 다시 고칠 필요가 없다(표 정의만 table-sections.ts에 추가하면 됨).
 */
async function buildSectionContents(projectId: string): Promise<SectionContent[]> {
  const db = getDb();
  const contents: SectionContent[] = [];
  const sections = db.prepare('SELECT id, section_type, data_json FROM approval_doc_sections WHERE project_id=?').all(projectId) as { id: string; section_type: string; data_json: string }[];

  for (const section of sections) {
    const sectionType = section.section_type as BuiltinSectionType;

    if (sectionType === 'revision_history') {
      const rows = db.prepare('SELECT * FROM approval_doc_revision_history WHERE project_id=? ORDER BY sort_order').all(projectId) as Record<string, unknown>[];
      contents.push({
        sectionInstanceId: section.id, paragraphs: [],
        table: {
          headers: ['개정일', '개정번호', '변경 내용', '작성자'],
          rows: rows.map(r => [String(r.revision_date || '-'), String(r.version_label || '-'), String(r.note_original || ''), String(r.traced_by || '')]),
        },
      });
      continue;
    }

    if (sectionType === 'general_spec') {
      const rows = db.prepare('SELECT * FROM approval_doc_general_spec_items WHERE project_id=? ORDER BY sort_order').all(projectId) as Record<string, unknown>[];
      contents.push({
        sectionInstanceId: section.id, paragraphs: [],
        table: {
          headers: ['구분', '항목', '단위', '기준값', '최소값', '최대값'],
          rows: rows.map(r => [String(r.division || '-'), String(r.inspection_item || ''), String(r.unit || ''), String(r.spec_value_original || '-'), String(r.min_value_original || '-'), String(r.max_value_original || '-')]),
        },
      });
      continue;
    }

    const tableConfig = TABLE_SECTION_CONFIG[sectionType];
    if (tableConfig) {
      const conds = ['project_id=?', 'section_id=?'];
      const values: unknown[] = [projectId, section.id];
      if (tableConfig.fixedValues) for (const [col, val] of Object.entries(tableConfig.fixedValues)) { conds.push(`${col}=?`); values.push(val); }
      const deletedFilter = tableConfig.dbTable === 'approval_doc_component_items' ? ' AND deleted=0' : '';
      const rows = db.prepare(`SELECT * FROM ${tableConfig.dbTable} WHERE ${conds.join(' AND ')}${deletedFilter} ORDER BY sort_order`).all(...values) as Record<string, unknown>[];
      contents.push({
        sectionInstanceId: section.id, paragraphs: [],
        table: {
          headers: tableConfig.columns.map(c => c.label.ko),
          rows: rows.map(r => tableConfig.columns.map(c => String(r[c.key] ?? ''))),
        },
      });
      continue;
    }

    const attachmentCategories = ATTACHMENT_SECTION_CATEGORIES[sectionType];
    if (attachmentCategories) {
      const rows = db.prepare('SELECT * FROM approval_doc_attachments WHERE project_id=? AND section_id=? AND is_current=1 ORDER BY category_key, created_at').all(projectId, section.id) as Record<string, unknown>[];
      const labelByKey = new Map(attachmentCategories.map(c => [c.key, c.label.ko]));

      // "PDF 페이지 선택 삽입"으로 지정된 페이지들을 실제 이미지로 래스터화한다 — 사용자가
      // 명시적으로 삽입 지정한 페이지만 문서에 그림으로 들어가고(요청서 §9), 지정 안 된
      // 첨부는 아래 attachments 텍스트 목록에만 남는다.
      const placements = db.prepare('SELECT * FROM approval_doc_image_placements WHERE section_id=? ORDER BY sort_order').all(section.id) as Record<string, unknown>[];
      const images: NonNullable<SectionContent['images']> = [];
      const insertedAttachmentIds = new Set<string>();
      for (const p of placements) {
        const att = rows.find(r => r.id === p.source_attachment_id);
        if (!att) continue;
        insertedAttachmentIds.add(String(att.id));
        const filePath = path.join(ATTACHMENT_UPLOAD_BASE, projectId, String(att.id), String(att.stored_filename));
        if (!fs.existsSync(filePath)) continue;
        let buf: Buffer | null = null;
        if (p.source_pdf_page) {
          buf = await rasterizePdfPage(filePath, p.source_pdf_page as number, 220);
        } else if (p.edited_file_path && fs.existsSync(String(p.edited_file_path))) {
          // 자르기/회전/배경정리가 적용된 결과가 있으면 원본 대신 그 결과를 삽입한다
          // (edit/route.ts가 항상 원본에서 다시 계산해 저장해두므로 여기서는 그대로 읽기만 함).
          buf = fs.readFileSync(String(p.edited_file_path));
        } else if (/\.(png|jpe?g)$/i.test(String(att.stored_filename))) {
          buf = fs.readFileSync(filePath);
          if (!/\.png$/i.test(filePath)) buf = await sharp(buf).png().toBuffer();
        }
        if (!buf) continue;
        const meta = await sharp(buf).metadata();
        if (!meta.width || !meta.height) continue;
        images.push({
          buffer: buf, width: meta.width, height: meta.height,
          caption: (p.caption_original as string) || `${labelByKey.get(String(att.category_key)) || ''}${p.source_pdf_page ? ` (p.${p.source_pdf_page})` : ''}`.trim() || null,
        });
      }

      contents.push({
        sectionInstanceId: section.id, paragraphs: [], images,
        attachments: rows.filter(r => !insertedAttachmentIds.has(String(r.id))).map(r => ({ filename: String(r.original_filename), description: labelByKey.get(String(r.category_key)) || null })),
      });
      continue;
    }

    const scalarFields = SCALAR_SECTION_FIELDS[sectionType];
    if (scalarFields) {
      const values = JSON.parse(section.data_json || '{}') as Record<string, string>;
      const paragraphs = scalarFields
        .filter(f => values[f.key]?.trim())
        .map(f => `${f.label.ko}: ${values[f.key]}`);
      contents.push({ sectionInstanceId: section.id, paragraphs });
      continue;
    }
    // 커스텀 섹션 등 위 어디에도 해당하지 않으면 docx-build.ts가 "(내용 없음)"으로 표시한다.
  }

  return contents;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const sectionRows = db.prepare('SELECT * FROM approval_doc_sections WHERE project_id=? ORDER BY sort_order').all(id) as Record<string, unknown>[];
  const sections: SectionInstance[] = sectionRows.map(r => ({
    id: r.id as string, projectId: id, sectionType: r.section_type as SectionInstance['sectionType'],
    included: !!r.included, sortOrder: r.sort_order as number, customTitle: r.custom_title as string | null,
  }));
  if (!sections.some(s => s.included)) {
    return NextResponse.json({ error: '포함된 섹션이 하나도 없습니다. 섹션 구성에서 최소 1개는 포함해야 합니다.' }, { status: 400 });
  }

  const { blocked, issues } = hasUnacknowledgedBlockingIssues(id);
  if (blocked) {
    return NextResponse.json({ error: '필수 항목이 누락되어 문서를 생성할 수 없습니다.', issues: issues.filter(i => i.severity === 'blocking') }, { status: 400 });
  }

  const { brand, template } = await resolveBrandAndTemplate(project);

  let result;
  try {
    result = await generateApprovalDocument({
      meta: {
        businessId: project.business_id as string,
        productName: project.product_name as string,
        modelName: project.model_name as string,
        customerName: (project.customer_name as string) || undefined,
        supplierName: (project.supplier_name as string) || undefined,
        revision: project.revision as string,
        issueDate: now().slice(0, 10),
      },
      docTitle: project.doc_type === 'spec' ? '제품 사양서' : project.doc_type === 'both' ? '제품 승인서 겸 사양서' : '제품 승인서',
      sections,
      contents: await buildSectionContents(id),
      lang: (project.final_language as 'ko' | 'zh' | 'en') || 'ko',
      brand, template,
    });
  } catch (e) {
    console.error('[approval-doc generate]', e);
    return NextResponse.json({ error: `문서 생성 실패: ${(e as Error).message}` }, { status: 500 });
  }

  const ts = now();
  const docxFileName = `${project.business_id}_Rev${project.revision}.docx`;
  const pdfFileName = `${project.business_id}_Rev${project.revision}.pdf`;
  const docxUpload = await nasUpload(buildNasPath('approval-doc', project.business_id as string, docxFileName), result.docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const pdfUpload = result.pdfBuffer
    ? await nasUpload(buildNasPath('approval-doc', project.business_id as string, pdfFileName), result.pdfBuffer, 'application/pdf')
    : null;

  db.transaction(() => {
    // 이전 is_final 문서는 최신이 아니게 내리고, 새로 생성된 것만 최종본으로 표시한다.
    db.prepare('UPDATE approval_doc_generated_documents SET is_final=0 WHERE project_id=?').run(id);
    if (docxUpload.success) {
      db.prepare(`INSERT INTO approval_doc_generated_documents
        (id, project_id, pass_number, file_type, stored_path, page_count, toc_page_map_json, generated_by, generated_by_name, generated_at, is_final)
        VALUES (?, ?, 2, 'docx', ?, ?, ?, ?, ?, ?, 1)`).run(
        newId(), id, docxUpload.path, result.pageCount, JSON.stringify(result.tocPageMap), user.id, user.name, ts,
      );
    }
    if (pdfUpload?.success) {
      db.prepare(`INSERT INTO approval_doc_generated_documents
        (id, project_id, pass_number, file_type, stored_path, page_count, toc_page_map_json, generated_by, generated_by_name, generated_at, is_final)
        VALUES (?, ?, 2, 'pdf', ?, ?, ?, ?, ?, ?, 1)`).run(
        newId(), id, pdfUpload.path, result.pageCount, JSON.stringify(result.tocPageMap), user.id, user.name, ts,
      );
    }
  })();

  writeApprovalAuditLog({
    projectId: id, action: 'generate_docx', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req,
    after: { pageCount: result.pageCount, hasPdf: !!result.pdfBuffer },
  });

  return NextResponse.json({
    data: {
      pageCount: result.pageCount,
      hasPdf: !!result.pdfBuffer,
      warning: result.pdfBuffer ? null : 'PDF 변환 서버(docverify)에 연결할 수 없어 DOCX만 생성되었습니다. 목차 페이지번호가 채워지지 않았습니다.',
    },
  });
}
