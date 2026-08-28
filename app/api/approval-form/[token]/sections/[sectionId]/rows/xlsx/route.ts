import { NextRequest, NextResponse } from 'next/server';
import type ExcelJS from 'exceljs';
import { getDb } from '@/lib/db/sqlite';
import { guardApprovalDocRequest } from '@/lib/approval-doc/token';
import { TABLE_SECTION_CONFIG } from '@/lib/approval-doc/table-sections';
import { exportTableSectionsXlsx, exportBlankTemplateXlsx, importTableSectionXlsx } from '@/lib/approval-doc/xlsx-tables';
import { defaultTitleFor } from '@/lib/approval-doc/section-registry';
import type { BuiltinSectionType } from '@/lib/approval-doc/types';

/** GET: 빈 양식(?blank=1) 또는 현재 표 데이터를 XLSX로 다운로드. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string }> }) {
  const { token, sectionId } = await params;
  const guard = guardApprovalDocRequest(token, false);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const section = db.prepare('SELECT section_type FROM approval_doc_sections WHERE id=? AND project_id=?').get(sectionId, guard.project.id) as { section_type: string } | undefined;
  if (!section) return NextResponse.json({ error: '없음' }, { status: 404 });
  const sectionType = section.section_type as BuiltinSectionType;
  const config = TABLE_SECTION_CONFIG[sectionType];
  if (!config) return NextResponse.json({ error: '지원하지 않는 섹션입니다.' }, { status: 400 });
  const title = defaultTitleFor(sectionType, 'ko');

  const blank = new URL(req.url).searchParams.get('blank') === '1';
  let buffer: ExcelJS.Buffer;
  if (blank) {
    buffer = await exportBlankTemplateXlsx(sectionType, title);
  } else {
    const conds = ['project_id=?', 'section_id=?'];
    const values: unknown[] = [guard.project.id, sectionId];
    if (config.fixedValues) for (const [col, val] of Object.entries(config.fixedValues)) { conds.push(`${col}=?`); values.push(val); }
    const deletedFilter = config.dbTable === 'approval_doc_component_items' ? ' AND deleted=0' : '';
    const rows = db.prepare(`SELECT * FROM ${config.dbTable} WHERE ${conds.join(' AND ')}${deletedFilter} ORDER BY sort_order`).all(...values) as Record<string, unknown>[];
    buffer = await exportTableSectionsXlsx([{ sectionType, title, rows }]);
  }

  const fileName = `${title}_${blank ? '양식' : guard.project.business_id}.xlsx`;
  return new NextResponse(new Uint8Array(Buffer.from(buffer as ArrayBuffer)), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // 한글 파일명은 raw HTTP 헤더에 그대로 못 넣으므로(ByteString 변환 에러) RFC 5987
      // filename*=UTF-8''... 형식으로 인코딩한다.
      'Content-Disposition': `attachment; filename="download.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}

/** POST: 업로드된 XLSX를 파싱해 미리보기(rows)만 반환한다 — 여기서 바로 저장하지 않고,
 * 화면(GenericTableEditor)이 이 결과로 편집 상태를 채운 뒤 사용자가 "임시저장"을 눌러야
 * 실제로 반영된다(요청서: "적용 전 검토 화면을 표시"). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sectionId: string }> }) {
  const { token, sectionId } = await params;
  const guard = guardApprovalDocRequest(token, true);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const db = getDb();
  const section = db.prepare('SELECT section_type FROM approval_doc_sections WHERE id=? AND project_id=?').get(sectionId, guard.project.id) as { section_type: string } | undefined;
  if (!section) return NextResponse.json({ error: '없음' }, { status: 404 });

  if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
    return NextResponse.json({ error: '멀티파트 요청만 지원합니다.' }, { status: 400 });
  }
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await importTableSectionXlsx(section.section_type as BuiltinSectionType, buf);
    return NextResponse.json({ data: result });
  } catch (e) {
    return NextResponse.json({ error: `가져오기 실패: ${(e as Error).message}` }, { status: 400 });
  }
}
