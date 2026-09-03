import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { buildInspectionXlsx } from '@/lib/approval-inspection/xlsx-build';
import { buildCurrentDocData } from '@/lib/approval-inspection/doc-data';

/** §17 "현재 데이터 다운로드" — /generate(NAS 업로드+PDF 변환 포함)와 달리 최종본
 * 생성 없이 지금 입력된 값을 바로 XLSX로 내려받기만 한다(작성 중간 점검용). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id);
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const data = buildCurrentDocData(id);
  const buf = await buildInspectionXlsx(data);
  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${data.meta.businessId}_current.xlsx"`,
    },
  });
}
