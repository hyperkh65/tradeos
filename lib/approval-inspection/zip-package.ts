import fs from 'fs';
import type { ZipArchive } from 'archiver';
import { getDb } from '@/lib/db/sqlite';
import { nasDownload } from '@/lib/storage/nas';
import { UPLOAD_BASE } from './storage';
import { PHOTO_CATEGORIES } from './types';

function safeSegment(s: string): string {
  return (s || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'file';
}

/** §18 ZIP 패키지 8개 폴더 구조 — 사진은 카테고리 그룹(제품전체/PCB/배선·커넥터)별로
 * 나누고, 원본과 편집본을 분리해 검토자가 "실제 찍힌 그대로"와 "문서에 들어간 결과"를
 * 구분해 볼 수 있게 한다. 비교자료(§11)는 출고선적승인서에만 존재하므로 해당 없으면
 * 폴더 자체가 만들어지지 않는다(빈 폴더를 억지로 만들지 않음). */
const PHOTO_GROUP_FOLDER: Record<string, string> = { product: '02_제품사진', pcb: '03_PCB사진', wiring: '04_배선커넥터사진' };
const CATEGORY_GROUP = new Map(PHOTO_CATEGORIES.map(c => [c.key, c.group]));

export async function appendInspectionProjectToZip(archive: ZipArchive, projectId: string, pathPrefix = ''): Promise<number> {
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=? AND deleted=0').get(projectId) as Record<string, unknown> | undefined;
  if (!project) return 0;

  let added = 0;
  const usedNames = new Set<string>();
  const uniqueName = (folder: string, base: string) => {
    let entryName = `${pathPrefix}${folder}/${safeSegment(base)}`;
    let n = 2;
    while (usedNames.has(entryName)) {
      const dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : '';
      entryName = `${pathPrefix}${folder}/${safeSegment(stem)}_${n}${ext}`;
      n++;
    }
    usedNames.add(entryName);
    return entryName;
  };

  // 01_승인검사보고서: 최종 생성된 DOCX/PDF/XLSX
  const docs = db.prepare(`SELECT file_type, stored_path FROM approval_inspection_generated_documents WHERE project_id=? AND is_final=1`).all(projectId) as { file_type: string; stored_path: string }[];
  for (const doc of docs) {
    const buf = await nasDownload(doc.stored_path);
    if (!buf) continue;
    archive.append(buf, { name: uniqueName('01_승인검사보고서', `${project.business_id}.${doc.file_type}`) });
    added++;
  }

  // 02~04: 제품/PCB/배선 사진 — 원본은 05_원본사진에도 별도 보관
  const products = db.prepare('SELECT id, product_name, model_name FROM approval_inspection_products WHERE project_id=? AND deleted=0 ORDER BY sort_order').all(projectId) as { id: string; product_name: string | null; model_name: string | null }[];
  for (const p of products) {
    const productLabel = safeSegment(p.model_name || p.product_name || p.id);
    const photos = db.prepare('SELECT * FROM approval_inspection_photos WHERE product_id=? AND is_current=1 ORDER BY category_key').all(p.id) as Record<string, unknown>[];
    for (const ph of photos) {
      const group = CATEGORY_GROUP.get(String(ph.category_key)) || 'product';
      const folder = PHOTO_GROUP_FOLDER[group] || '02_제품사진';
      const origPath = `${UPLOAD_BASE}/${projectId}/${ph.id}/${ph.stored_filename}`;
      if (fs.existsSync(origPath)) {
        archive.file(origPath, { name: uniqueName('05_원본사진', `${productLabel}_${ph.category_key}_${ph.original_filename}`) });
        added++;
      }
      const displayPath = ph.edited_file_path && fs.existsSync(String(ph.edited_file_path)) ? String(ph.edited_file_path) : origPath;
      if (fs.existsSync(displayPath)) {
        archive.file(displayPath, { name: uniqueName(folder, `${productLabel}_${ph.category_key}${displayPath.slice(displayPath.lastIndexOf('.'))}`) });
        added++;
      }
    }
  }

  // 06_측정데이터: 지금 입력된 값을 XLSX로 즉석 생성해 넣는다(별도 /generate 없이도 항상 최신)
  try {
    const { buildInspectionXlsx } = await import('./xlsx-build');
    const { buildCurrentDocData } = await import('./doc-data');
    const data = buildCurrentDocData(projectId);
    const xlsxBuf = await buildInspectionXlsx(data);
    archive.append(Buffer.from(xlsxBuf), { name: uniqueName('06_측정데이터', `${project.business_id}_측정데이터.xlsx`) });
    added++;
  } catch { /* 측정데이터 생성 실패는 ZIP 전체를 막지 않는다 */ }

  // 07_비교자료: 출고선적승인서에만 존재
  if (project.report_type === 'pre_shipment') {
    const diffRows = db.prepare(`
      SELECT d.*, p.product_name, p.model_name FROM approval_inspection_diffs d
      JOIN approval_inspection_products p ON p.id = d.product_id
      WHERE d.project_id=? ORDER BY p.sort_order, d.sort_order
    `).all(projectId) as Record<string, unknown>[];
    if (diffRows.length > 0) {
      const lines = diffRows.map(d => `${d.model_name || d.product_name}\t${d.compare_item}\t${d.judgement || '-'}\t${d.change_location || '-'}\t${d.reason || '-'}`);
      const content = `제품\t비교항목\t판정\t변경위치\t사유\n${lines.join('\n')}`;
      archive.append(Buffer.from(content, 'utf8'), { name: uniqueName('07_비교자료', `${project.business_id}_비교자료.tsv`) });
      added++;
    }
  }

  // 08_수정요청이력
  const revisions = db.prepare('SELECT * FROM approval_inspection_revision_requests WHERE project_id=? ORDER BY requested_at').all(projectId) as Record<string, unknown>[];
  if (revisions.length > 0) {
    const lines = revisions.map(r => `${r.requested_at}\t${r.requested_by_name || '-'}\t${r.status}\t${r.request_content}\t${r.supplier_response || '-'}`);
    const content = `요청일시\t요청자\t상태\t요청내용\t공급업체응답\n${lines.join('\n')}`;
    archive.append(Buffer.from(content, 'utf8'), { name: uniqueName('08_수정요청이력', `${project.business_id}_수정요청이력.tsv`) });
    added++;
  }

  return added;
}
