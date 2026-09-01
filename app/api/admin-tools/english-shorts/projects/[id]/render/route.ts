import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { getProjectById, listProjectSources, updateProject } from '@/lib/admin-tools/english-shorts/db';
import { enqueueRenderJob, listRenderJobsForProject } from '@/lib/admin-tools/english-shorts/render-db';
import { writeEnglishShortsAuditLog } from '@/lib/admin-tools/english-shorts/audit';
import { requireEnglishShortsToolActive } from '@/lib/admin-tools/english-shorts/tool-status';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ jobs: listRenderJobsForProject(id) });
}

/** 렌더 잡을 큐에 등록한다 — 이미 대기/처리 중인 잡이 있으면 중복 등록을
 * 막고 그 잡을 그대로 반환한다(같은 프로젝트에 동시 렌더 잡 여러 개가 쌓이는
 * 것을 방지). 실제 인코딩은 워커(Phase 13)가 백그라운드에서 처리 — 이 요청은
 * 절대 인코딩이 끝날 때까지 기다리지 않는다. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const toolActive = await requireEnglishShortsToolActive();
  if (!toolActive.ok) return toolActive.response;
  const { user } = auth;
  const { id } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const links = listProjectSources(id);
  if (links.length === 0) {
    return NextResponse.json({ error: '연결된 소스 클립이 없어 렌더링할 수 없습니다' }, { status: 400 });
  }

  const existingActive = listRenderJobsForProject(id).find(j => j.status === 'queued' || j.status === 'processing');
  if (existingActive) {
    return NextResponse.json({ job: existingActive, alreadyQueued: true }, { status: 409 });
  }

  const job = enqueueRenderJob(id, user.id, user.name);
  updateProject(id, { status: 'rendering' });
  writeEnglishShortsAuditLog({ projectId: id, userId: user.id, userName: user.name, action: 'RENDER_STARTED', after: { jobId: job.id }, req });

  return NextResponse.json({ job }, { status: 201 });
}
