import fs from 'fs';
import type { ZipArchive } from 'archiver';
import { getDb } from '@/lib/db/sqlite';
import { nasDownload } from '@/lib/storage/nas';

function safeSegment(s: string): string {
  return (s || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'file';
}

// 요청서 §16 "전체 패키지 다운로드"의 13개 폴더 — 첨부파일의 section_type/category_key로
// 최대한 정확히 분류하고, 매칭되는 폴더가 없는 자료는 13_Original_Attachments로 모은다
// (억지로 부정확한 폴더에 끼워 넣지 않는다).
const FOLDER_BY_SECTION_TYPE: Record<string, string> = {
  optical: '02_Product_Images',
  circuit_diagram: '04_Circuit_Diagrams',
  pcb_drawing: '05_PCB_Drawings',
  rohs: '10_RoHS',
  reliability_test: '11_Reliability',
  packing_spec: '12_Packing',
};
function certOrTestFolder(categoryKey: string): string {
  if (categoryKey.startsWith('lm80') || categoryKey.includes('lm-80') || categoryKey.includes('lm80')) return '09_LM80';
  return '07_Certificates';
}

const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-documents'
  : `${process.cwd()}/data/uploads/approval-documents`;

/**
 * 프로젝트 하나의 문서·첨부파일을 13폴더 구조로 archive에 추가한다. pathPrefix를 주면
 * (여러 프로젝트 일괄 다운로드 시) 그 앞에 "프로젝트 business_id/" 하나를 더 씌운다 —
 * 단일 다운로드 라우트와 일괄 다운로드 라우트가 이 함수 하나를 공유해서 폴더 분류 로직이
 * 두 곳에서 따로 어긋날 일이 없게 한다.
 */
export async function appendProjectToZip(archive: ZipArchive, projectId: string, pathPrefix = ''): Promise<number> {
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(projectId) as Record<string, unknown> | undefined;
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

  const docs = db.prepare(`SELECT file_type, stored_path FROM approval_doc_generated_documents WHERE project_id=? AND is_final=1`).all(projectId) as { file_type: string; stored_path: string }[];
  for (const doc of docs) {
    const buf = await nasDownload(doc.stored_path);
    if (!buf) continue;
    archive.append(buf, { name: uniqueName('01_Approval_Document', `${project.business_id}_Rev${project.revision}.${doc.file_type}`) });
    added++;
  }

  const attachments = db.prepare(`
    SELECT a.original_filename, a.stored_filename, a.category_key, s.section_type, a.id as attachment_id
    FROM approval_doc_attachments a
    LEFT JOIN approval_doc_sections s ON s.id = a.section_id
    WHERE a.project_id=? AND a.is_current=1
  `).all(projectId) as { original_filename: string; stored_filename: string; category_key: string; section_type: string | null; attachment_id: string }[];

  for (const a of attachments) {
    const folder = a.section_type === 'certification'
      ? certOrTestFolder(a.category_key)
      : (a.section_type && FOLDER_BY_SECTION_TYPE[a.section_type]) || '13_Original_Attachments';
    const filePath = `${UPLOAD_BASE}/${projectId}/${a.attachment_id}/${a.stored_filename}`;
    if (!fs.existsSync(filePath)) continue;
    archive.file(filePath, { name: uniqueName(folder, a.original_filename) });
    added++;
  }

  return added;
}
