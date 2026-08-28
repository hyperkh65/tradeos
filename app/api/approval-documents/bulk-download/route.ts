import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { ZipArchive } from 'archiver';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { writeApprovalAuditLog } from '@/lib/approval-doc/audit';
import { appendProjectToZip } from '@/lib/approval-doc/zip-package';

/** 요청서 §17 "여러 프로젝트를 선택하여 승인서와 첨부자료를 일괄 다운로드" — 각 프로젝트를
 * business_id 폴더로 나눠 하나의 ZIP에 담는다(13폴더 구조는 프로젝트별로 그 안에서 유지). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: '선택된 프로젝트가 없습니다.' }, { status: 400 });

  const db = getDb();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  let total = 0;
  for (const id of ids) {
    const project = db.prepare('SELECT business_id FROM approval_doc_projects WHERE id=?').get(id) as { business_id: string } | undefined;
    if (!project) continue;
    total += await appendProjectToZip(archive, id, `${project.business_id}/`);
    writeApprovalAuditLog({ projectId: id, action: 'download_zip', actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req });
  }

  if (total === 0) {
    archive.abort();
    return NextResponse.json({ error: '내려받을 파일이 없습니다.' }, { status: 404 });
  }

  archive.finalize();
  const zipName = `제품승인서_일괄다운로드_${ids.length}건.zip`;
  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
