import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { nasDownload } from '@/lib/storage/nas';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT business_id FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as { business_id: string } | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const doc = db.prepare(`SELECT stored_path FROM approval_inspection_generated_documents WHERE project_id=? AND file_type='docx' AND is_final=1 ORDER BY generated_at DESC LIMIT 1`).get(id) as { stored_path: string } | undefined;
  if (!doc) return NextResponse.json({ error: '아직 생성된 문서가 없습니다. 먼저 문서를 생성하세요.' }, { status: 404 });

  const buf = await nasDownload(doc.stored_path);
  if (!buf) return NextResponse.json({ error: '파일을 읽을 수 없습니다.' }, { status: 500 });

  writeInspectionAuditLog({ projectId: id, action: 'download_docx', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${project.business_id}.docx"`,
    },
  });
}
