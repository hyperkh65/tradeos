import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { getProjectById } from '@/lib/admin-tools/english-shorts/db';
import { getRenderJobById } from '@/lib/admin-tools/english-shorts/render-db';
import { downloadEnglishShortsFile } from '@/lib/admin-tools/english-shorts/storage';
import { writeEnglishShortsAuditLog } from '@/lib/admin-tools/english-shorts/audit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const { id, jobId } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const job = getRenderJobById(jobId);
  if (!job || job.projectId !== id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (job.status !== 'completed' || !job.outputVideoPath) {
    return NextResponse.json({ error: '아직 렌더가 완료되지 않았습니다' }, { status: 400 });
  }

  const buffer = await downloadEnglishShortsFile(job.outputVideoPath);
  if (!buffer) return NextResponse.json({ error: '결과 파일을 읽을 수 없습니다(삭제되었을 수 있음)' }, { status: 404 });

  writeEnglishShortsAuditLog({ projectId: id, userId: user.id, userName: user.name, action: 'OUTPUT_DOWNLOADED', after: { jobId }, req });

  const fileName = `${project.businessId}.mp4`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
