import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { buildBlankReferenceTemplateXlsx } from '@/lib/approval-inspection/xlsx-import';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT business_id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { business_id: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const buf = await buildBlankReferenceTemplateXlsx();
  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${project.business_id}_blank_template.xlsx"`,
    },
  });
}
