import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { ZipArchive } from 'archiver';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { appendProjectToZip } from '@/lib/approval-doc/zip-package';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const project = db.prepare('SELECT * FROM approval_doc_projects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!project) return NextResponse.json({ error: '없음' }, { status: 404 });

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const added = await appendProjectToZip(archive, id);

  if (added === 0) {
    archive.abort();
    return NextResponse.json({ error: '내려받을 파일이 없습니다. 먼저 문서를 생성하거나 자료를 첨부하세요.' }, { status: 404 });
  }

  archive.finalize();
  writeApprovalAuditLog({ projectId: id, action: 'download_zip', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req });

  const zipName = `${project.business_id}_전체패키지.zip`;
  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
