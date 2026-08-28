import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db/sqlite';
import { extractFileText, EXTRACTABLE_EXTENSIONS } from './file-extract';

/**
 * "인덱싱 대상"을 하나 더 추가할 때 건드릴 곳은 이 파일뿐이어야 한다.
 * product/inspection/claim은 DB에 이미 있는 텍스트, attachment는 검품/클레임에 첨부된
 * 리포트 파일(PDF/DOCX/XLSX/TXT/CSV) 원문 — 이미지 첨부파일은 OCR이 필요해 이번 단계
 * 대상에서 의도적으로 제외한다(텍스트 PDF에는 OCR을 쓰지 않는다는 원칙과 별개로,
 * 사진 첨부파일 자체의 텍스트화는 범위 밖).
 */
export type IndexableSourceType = 'product' | 'inspection' | 'claim' | 'attachment';

export const INDEXABLE_SOURCE_TYPES: IndexableSourceType[] = ['product', 'inspection', 'claim', 'attachment'];

type AttachmentParentType = 'inspection' | 'claim';

const ATTACHMENT_UPLOAD_BASE: Record<AttachmentParentType, string> = {
  inspection: process.env.NODE_ENV === 'production' ? '/volume1/web/tradeos/data/uploads/inspections' : path.join(process.cwd(), 'data/uploads/inspections'),
  claim: process.env.NODE_ENV === 'production' ? '/volume1/web/tradeos/data/uploads/claims' : path.join(process.cwd(), 'data/uploads/claims'),
};

interface StoredFileRef { filename?: string; originalName?: string; fileType?: string; url?: string }

/** 검품/클레임 업로드 라우트가 저장한 형식과 동일하게 report_files JSON을 해석한다
 * (app/api/{inspections,claims}/[id]/upload/route.ts 참고 — 이 파일이 그 유일한 소스). */
function parseReportFiles(json: string | null | undefined): StoredFileRef[] {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/** attachment의 sourceId는 "부모타입:부모id:파일명" 합성키다(별도 테이블이 없으므로). */
export function attachmentSourceId(parentType: AttachmentParentType, parentId: string, filename: string): string {
  return `${parentType}:${parentId}:${filename}`;
}

function parseAttachmentSourceId(sourceId: string): { parentType: AttachmentParentType; parentId: string; filename: string } | null {
  const [parentType, parentId, ...rest] = sourceId.split(':');
  if ((parentType !== 'inspection' && parentType !== 'claim') || !parentId || rest.length === 0) return null;
  return { parentType, parentId, filename: rest.join(':') };
}

/** 특정 검품/클레임 레코드가 현재 가지고 있는 "인덱싱 가능한(텍스트 추출 가능한 확장자)"
 * 리포트 첨부파일들의 sourceId 목록 — 부모 재인덱싱 시 이 목록으로 첨부파일도 함께 갱신한다. */
export function listAttachmentSourceIdsForParent(parentType: AttachmentParentType, parentId: string): string[] {
  const db = getDb();
  const table = parentType === 'inspection' ? 'inspections' : 'claims';
  const row = db.prepare(`SELECT report_files FROM ${table} WHERE id=?`).get(parentId) as { report_files: string | null } | undefined;
  if (!row) return [];
  return parseReportFiles(row.report_files)
    .filter(f => f.fileType === 'report' && f.filename)
    .filter(f => (EXTRACTABLE_EXTENSIONS as string[]).includes(path.extname(f.filename!).slice(1).toLowerCase()))
    .map(f => attachmentSourceId(parentType, parentId, f.filename!));
}

async function buildAttachmentDocument(sourceId: string): Promise<SourceDocument | null> {
  const parsed = parseAttachmentSourceId(sourceId);
  if (!parsed) return null;
  const { parentType, parentId, filename } = parsed;

  const validIds = new Set(listAttachmentSourceIdsForParent(parentType, parentId));
  if (!validIds.has(sourceId)) return null; // 부모에서 이미 삭제된 첨부파일

  const filepath = path.join(ATTACHMENT_UPLOAD_BASE[parentType], parentId, 'reports', filename);
  if (!fs.existsSync(filepath)) return null;

  const ext = path.extname(filename).slice(1);
  const buf = fs.readFileSync(filepath);
  const extracted = await extractFileText(buf, ext);
  if (!extracted || !extracted.text.trim()) return null;

  const stat = fs.statSync(filepath);
  const parentLabel = parentType === 'inspection' ? '검품' : '클레임';
  return {
    title: `첨부파일 - ${filename} (${parentLabel})`,
    text: extracted.text,
    sourceUpdatedAt: stat.mtime.toISOString(),
  };
}

export interface SourceDocument {
  title: string;
  text: string;
  sourceUpdatedAt: string;
  /** 목록 화면의 ?open=businessId 딥링크에 쓰는 사람이 읽는 식별자(예: QC-0001) —
   * 내부 DB id와는 다른 값이라 출처 링크를 만들 때 별도로 들고 다닌다. */
  businessId?: string;
  departmentId?: string | null;
  visibility?: string | null;
  securityLevel?: string | null;
}

function buildProductDocument(id: string): SourceDocument | null {
  const db = getDb();
  const p = db.prepare(`SELECT * FROM products WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  if (!p) return null;
  const lines = [
    `제품명: ${p.name_ko}${p.name_en ? ` (${p.name_en})` : ''}`,
    `제품코드: ${p.code}`,
    p.category ? `분류: ${p.category}` : '',
    p.supplier_name ? `공급업체: ${p.supplier_name}` : '',
    p.purchase_price ? `구매단가: ${p.purchase_price} ${p.currency}` : '',
    p.selling_price ? `판매단가: ${p.selling_price} ${p.currency}` : '',
    p.moq ? `최소주문수량(MOQ): ${p.moq}` : '',
    p.lead_time_days ? `리드타임: ${p.lead_time_days}일` : '',
    p.hs_code ? `HS코드: ${p.hs_code}` : '',
    p.country_of_origin ? `원산지: ${p.country_of_origin}` : '',
    `상태: ${p.status}`,
  ].filter(Boolean);
  return {
    title: `제품 - ${p.name_ko}`,
    text: lines.join('\n'),
    sourceUpdatedAt: (p.updated_at as string) || (p.created_at as string),
    businessId: p.business_id as string,
  };
}

function buildInspectionDocument(id: string): SourceDocument | null {
  const db = getDb();
  const i = db.prepare(`SELECT * FROM inspections WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  if (!i) return null;
  const lines = [
    `검품번호: ${i.business_id}`,
    `발주번호: ${i.po_business_id}`,
    `공급업체: ${i.supplier_name}`,
    `제품: ${i.product_name}`,
    `검품일자: ${i.inspection_date}`,
    i.inspector ? `검사자: ${i.inspector}` : '',
    `검품유형: ${i.inspection_type}`,
    `샘플수량: ${i.sample_qty}건, 검사수량: ${i.checked_qty ?? 0}건, 합격: ${i.passed_qty ?? 0}건, 불합격: ${i.failed_qty ?? 0}건`,
    i.defect_rate != null ? `불량률: ${i.defect_rate}%` : '',
    `검품결과: ${i.result}`,
    i.summary ? `검품 내용: ${i.summary}` : '',
    `상태: ${i.status}`,
  ].filter(Boolean);
  return {
    title: `검품 - ${i.product_name} (${i.business_id})`,
    text: lines.join('\n'),
    sourceUpdatedAt: i.created_at as string,
    businessId: i.business_id as string,
  };
}

function buildClaimDocument(id: string): SourceDocument | null {
  const db = getDb();
  const c = db.prepare(`SELECT * FROM claims WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  if (!c) return null;
  const lines = [
    `클레임번호: ${c.business_id}`,
    c.customer_name ? `고객사: ${c.customer_name}` : '',
    c.supplier_name ? `공급업체: ${c.supplier_name}` : '',
    c.product_name ? `제품: ${c.product_name}` : '',
    c.po_business_id ? `발주번호: ${c.po_business_id}` : '',
    `문제유형: ${c.issue_type}`,
    `내용: ${c.description}`,
    c.claim_amount ? `클레임 금액: ${c.claim_amount} ${c.currency || ''}` : '',
    c.compensation_type ? `보상 유형: ${c.compensation_type}` : '',
    c.compensation_amount ? `보상 금액: ${c.compensation_amount}` : '',
    `상태: ${c.status}`,
  ].filter(Boolean);
  return {
    title: `클레임 - ${c.issue_type} (${c.business_id})`,
    text: lines.join('\n'),
    sourceUpdatedAt: (c.updated_at as string) || (c.created_at as string),
    businessId: c.business_id as string,
  };
}

export async function buildSourceDocument(sourceType: IndexableSourceType, sourceId: string): Promise<SourceDocument | null> {
  switch (sourceType) {
    case 'product': return buildProductDocument(sourceId);
    case 'inspection': return buildInspectionDocument(sourceId);
    case 'claim': return buildClaimDocument(sourceId);
    case 'attachment': return buildAttachmentDocument(sourceId);
  }
}

const TABLE_BY_TYPE: Record<Exclude<IndexableSourceType, 'attachment'>, string> = {
  product: 'products', inspection: 'inspections', claim: 'claims',
};

export function listAllSourceIds(sourceType: IndexableSourceType): string[] {
  const db = getDb();
  if (sourceType === 'attachment') {
    const ids: string[] = [];
    for (const parentType of ['inspection', 'claim'] as const) {
      const table = parentType === 'inspection' ? 'inspections' : 'claims';
      const rows = db.prepare(`SELECT id FROM ${table}`).all() as { id: string }[];
      for (const r of rows) ids.push(...listAttachmentSourceIdsForParent(parentType, r.id));
    }
    return ids;
  }
  const rows = db.prepare(`SELECT id FROM ${TABLE_BY_TYPE[sourceType]}`).all() as { id: string }[];
  return rows.map(r => r.id);
}

export function countAllSources(): Record<IndexableSourceType, number> {
  const out = {} as Record<IndexableSourceType, number>;
  for (const t of INDEXABLE_SOURCE_TYPES) {
    out[t] = listAllSourceIds(t).length;
  }
  return out;
}
