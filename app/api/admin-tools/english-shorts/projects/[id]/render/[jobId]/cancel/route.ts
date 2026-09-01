import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { getProjectById } from '@/lib/admin-tools/english-shorts/db';
import { getRenderJobById, requestCancelRenderJob, markRenderJobCancelled } from '@/lib/admin-tools/english-shorts/render-db';

/** status='queued'인 잡은 아직 인코딩을 시작하지 않았으므로 즉시 확실하게
 * 취소 확정한다. status='processing'인 잡은 취소 요청 플래그만 세운다 —
 * 이미 돌고 있는 FFmpeg 프로세스를 강제 종료하는 기능은 이번 phase 범위 밖
 * 이라, 워커가 다음 잡을 집기 전(즉 이번 인코딩이 끝난 뒤) 확인하는 정도의
 * best-effort다. 이 한계를 API 응답에 정직하게 표시한다. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { id, jobId } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const job = getRenderJobById(jobId);
  if (!job || job.projectId !== id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (job.status !== 'queued' && job.status !== 'processing') {
    return NextResponse.json({ error: '이미 종료된 잡은 취소할 수 없습니다' }, { status: 400 });
  }

  if (job.status === 'queued') {
    markRenderJobCancelled(jobId);
    return NextResponse.json({ job: getRenderJobById(jobId), immediate: true });
  }

  requestCancelRenderJob(jobId);
  return NextResponse.json({
    job: getRenderJobById(jobId),
    immediate: false,
    note: '이미 인코딩이 진행 중이라 이번 렌더는 완료되거나 실패할 때까지 즉시 중단되지는 않습니다.',
  });
}
