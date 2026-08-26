import ExcelJS from 'exceljs';
import { DISPLAY_FIELDS, FIXTURE_PART_FIXED_ROWS, ATTACHMENT_CATEGORIES, getDisplayFieldValue, type TranslatableValue } from './field-schema';

const B: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF999999' } };
const bAll = { top: B, left: B, bottom: B, right: B } as ExcelJS.Borders;
const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } } as ExcelJS.Fill;

function headerRow(ws: ExcelJS.Worksheet, values: string[]) {
  const r = ws.addRow(values);
  r.font = { bold: true };
  r.eachCell(c => { c.border = bAll; c.fill = headerFill; c.alignment = { vertical: 'middle', wrapText: true }; });
  return r;
}

interface ComponentItemRow {
  listType: string; rowKey: string | null; partName: string | null; modelName: string | null;
  specText: string | null; material: string | null; widthMm: string | null; depthMm: string | null;
  heightMm: string | null; qty: string | null; manufacturer: string | null; remark: string | null;
}
interface AttachmentRow {
  categoryKey: string; originalFilename: string; sizeBytes: number; createdAt: string; version: number;
  uploadedBy?: string; submissionVersion?: number; isCurrent?: boolean;
}
interface SubmissionVersionRow { versionNo: number; submittedAt: string; submittedByName: string; status: string }
interface ClosureRow { closedByUserName: string; closedAt: string; reasonMemo?: string | null; reopenedAt?: string | null; reopenedByUserName?: string | null }

export interface XlsxGenerateInput {
  project: { businessId: string; productName: string; internalRefNo?: string | null; supplierName: string; contactPerson?: string | null; requestedAt?: string | null; dueDate?: string | null; status: string; createdByName?: string | null };
  converterType: string | null;
  formData: Record<string, TranslatableValue>;
  componentItems: ComponentItemRow[];
  attachments: AttachmentRow[];
  submissionVersions: SubmissionVersionRow[];
  closures: ClosureRow[];
}

const STATUS_LABEL_KO: Record<string, string> = {
  draft: '작성중', submitted: '제출됨', editing: '수정중', resubmitted: '재제출됨', closed: '마감됨',
};
const CONVERTER_TYPE_LABEL_KO: Record<string, string> = {
  has_converter: '컨버터 있음', no_converter: '컨버터 없음', integrated: '등기구 일체형 컨버터', na: '해당 없음',
};

export async function generateSupplierFormXlsx(input: XlsxGenerateInput): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'YNK 그룹웨어';

  // 1) 프로젝트 기본정보
  {
    const ws = wb.addWorksheet('프로젝트 기본정보');
    ws.pageSetup = { orientation: 'portrait', fitToPage: true, printArea: 'A1:B12' };
    ws.columns = [{ key: 'k', width: 20 }, { key: 'v', width: 50 }];
    const rows: [string, string][] = [
      ['문서번호', input.project.businessId],
      ['프로젝트 제품명', input.project.productName],
      ['내부 관리번호', input.project.internalRefNo || '-'],
      ['공급업체명', input.project.supplierName],
      ['담당자', input.project.contactPerson || '-'],
      ['제출 요청일', input.project.requestedAt || '-'],
      ['제출기한', input.project.dueDate || '-'],
      ['현재 상태', STATUS_LABEL_KO[input.project.status] || input.project.status],
      ['컨버터 사용 여부', input.converterType ? (CONVERTER_TYPE_LABEL_KO[input.converterType] || input.converterType) : '-'],
      ['생성자', input.project.createdByName || '-'],
    ];
    for (const [k, v] of rows) {
      const r = ws.addRow([k, v]);
      r.getCell(1).font = { bold: true };
      r.eachCell(c => { c.border = bAll; c.alignment = { wrapText: true, vertical: 'top' }; });
    }
  }

  // 2) 표시사항
  {
    const ws = wb.addWorksheet('표시사항');
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, printArea: 'A1:E20' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.columns = [
      { key: 'label', width: 28 }, { key: 'value', width: 40 }, { key: 'original', width: 30 },
      { key: 'lang', width: 10 }, { key: 'status', width: 14 },
    ];
    headerRow(ws, ['항목', '한국어 확정값', '원문', '입력 언어', '번역상태']);
    const kv = (key: string) => input.formData[key]?.korean || input.formData[key]?.original || '';
    for (const f of DISPLAY_FIELDS) {
      const entry = input.formData[f.key];
      const korean = f.key === 'originMarking' || f.key === 'ledPackageArrayTotal' ? getDisplayFieldValue(f.key, kv) : (entry?.korean || '');
      const r = ws.addRow([f.label.ko, korean, entry?.original || '', entry?.lang || '', entry?.translationStatus || '']);
      r.eachCell(c => { c.border = bAll; c.alignment = { wrapText: true, vertical: 'top' }; });
    }
  }

  // 3) 등기구 부품 리스트
  {
    const ws = wb.addWorksheet('등기구 부품 리스트');
    ws.pageSetup = { orientation: 'landscape', fitToPage: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.columns = [
      { key: 'part', width: 20 }, { key: 'model', width: 22 }, { key: 'spec', width: 24 }, { key: 'material', width: 14 },
      { key: 'w', width: 10 }, { key: 'd', width: 10 }, { key: 'h', width: 12 }, { key: 'qty', width: 8 },
      { key: 'mfr', width: 26 }, { key: 'remark', width: 18 },
    ];
    headerRow(ws, ['부품', '형명', '명세', '재질', '가로(mm)', '세로(mm)', '높이/두께(mm)', '수량', '제조회사', '비고']);
    const fixtureItems = input.componentItems.filter(c => c.listType === 'fixture_part');
    for (const row of FIXTURE_PART_FIXED_ROWS) {
      const item = fixtureItems.find(i => i.rowKey === row.rowKey);
      const r = ws.addRow([
        row.label.ko, item?.modelName || '', item?.specText || '', item?.material || '',
        item?.widthMm || '', item?.depthMm || '', item?.heightMm || '', item?.qty || '', item?.manufacturer || '', item?.remark || '',
      ]);
      r.eachCell(c => { c.border = bAll; c.alignment = { wrapText: true, vertical: 'top' }; });
    }
    // 고정 카테고리를 넘어서 사용자가 추가한 행
    for (const item of fixtureItems.filter(i => !FIXTURE_PART_FIXED_ROWS.some(f => f.rowKey === i.rowKey))) {
      const r = ws.addRow([item.partName || '(추가)', item.modelName || '', item.specText || '', item.material || '', item.widthMm || '', item.depthMm || '', item.heightMm || '', item.qty || '', item.manufacturer || '', item.remark || '']);
      r.eachCell(c => { c.border = bAll; c.alignment = { wrapText: true, vertical: 'top' }; });
    }
  }

  // 4) 컨버터 부품 리스트
  {
    const ws = wb.addWorksheet('컨버터 부품 리스트');
    ws.pageSetup = { orientation: 'landscape', fitToPage: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.columns = [{ key: 'part', width: 20 }, { key: 'model', width: 20 }, { key: 'spec', width: 26 }, { key: 'qty', width: 8 }, { key: 'mfr', width: 30 }, { key: 'remark', width: 18 }];
    headerRow(ws, ['부품', '형명', '명세', '수량', '제조회사', '비고']);
    for (const item of input.componentItems.filter(c => c.listType === 'converter_part')) {
      const r = ws.addRow([item.partName || '', item.modelName || '', item.specText || '', item.qty || '', item.manufacturer || '', item.remark || '']);
      r.eachCell(c => { c.border = bAll; c.alignment = { wrapText: true, vertical: 'top' }; });
    }
  }

  // 5) 복수부품
  {
    const ws = wb.addWorksheet('복수부품');
    ws.pageSetup = { orientation: 'landscape', fitToPage: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.columns = [{ key: 'part', width: 20 }, { key: 'model', width: 20 }, { key: 'spec', width: 26 }, { key: 'qty', width: 8 }, { key: 'mfr', width: 30 }, { key: 'remark', width: 18 }];
    headerRow(ws, ['부품', '형명', '명세', '수량', '제조회사', '비고']);
    for (const item of input.componentItems.filter(c => c.listType === 'multi_component')) {
      const r = ws.addRow([item.partName || '', item.modelName || '', item.specText || '', item.qty || '', item.manufacturer || '', item.remark || '']);
      r.eachCell(c => { c.border = bAll; c.alignment = { wrapText: true, vertical: 'top' }; });
    }
  }

  // 6) 첨부파일 목록
  {
    const ws = wb.addWorksheet('첨부파일 목록');
    ws.pageSetup = { orientation: 'landscape', fitToPage: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = 'A1:G1';
    ws.columns = [
      { key: 'cat', width: 24 }, { key: 'file', width: 34 }, { key: 'size', width: 12 },
      { key: 'uploaded', width: 20 }, { key: 'ver', width: 8 }, { key: 'subver', width: 10 }, { key: 'current', width: 10 },
    ];
    headerRow(ws, ['자료 구분', '원본 파일명', '크기(KB)', '업로드일시', '버전', '제출버전', '현재 유효']);
    for (const a of input.attachments) {
      const catLabel = ATTACHMENT_CATEGORIES.find(c => c.key === a.categoryKey)?.label.ko || a.categoryKey;
      const r = ws.addRow([catLabel, a.originalFilename, Math.round(a.sizeBytes / 1024), a.createdAt?.slice(0, 19).replace('T', ' '), a.version, a.submissionVersion || '', a.isCurrent === false ? '아니오' : '예']);
      r.eachCell(c => { c.border = bAll; });
    }
  }

  // 7) 제출 및 마감 이력
  {
    const ws = wb.addWorksheet('제출 및 마감 이력');
    ws.pageSetup = { orientation: 'landscape', fitToPage: true };
    ws.columns = [{ key: 'a', width: 14 }, { key: 'b', width: 22 }, { key: 'c', width: 22 }, { key: 'd', width: 40 }];
    headerRow(ws, ['구분', '일시', '처리자', '비고']);
    for (const v of input.submissionVersions) {
      const r = ws.addRow([`제출 v${v.versionNo}`, v.submittedAt?.slice(0, 19).replace('T', ' '), v.submittedByName, v.status]);
      r.eachCell(c => { c.border = bAll; });
    }
    for (const cl of input.closures) {
      const r1 = ws.addRow(['마감', cl.closedAt?.slice(0, 19).replace('T', ' '), cl.closedByUserName, cl.reasonMemo || '']);
      r1.eachCell(c => { c.border = bAll; });
      if (cl.reopenedAt) {
        const r2 = ws.addRow(['마감해제', cl.reopenedAt.slice(0, 19).replace('T', ' '), cl.reopenedByUserName || '', '']);
        r2.eachCell(c => { c.border = bAll; });
      }
    }
  }

  return wb.xlsx.writeBuffer();
}
