import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { ZipArchive } from 'archiver';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';
import { appendInspectionProjectToZip } from '@/lib/approval-inspection/zip-package';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_inspection_projects WHERE id=? AND deleted=0').get(id) as Record<string, unknown> | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const added = await appendInspectionProjectToZip(archive, id);

  if (added === 0) {
    archive.abort();
    return NextResponse.json({ error: '내려받을 파일이 없습니다. 먼저 제품을 등록하세요.' }, { status: 404 });
  }

  archive.finalize();
  writeInspectionAuditLog({ projectId: id, action: 'download_zip', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req });

  const zipName = `${project.business_id}_전체패키지.zip`;
  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
