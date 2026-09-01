import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { getProjectById } from '@/lib/admin-tools/english-shorts/db';
import { getRenderJobById, listRenderLogs } from '@/lib/admin-tools/english-shorts/render-db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { id, jobId } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const job = getRenderJobById(jobId);
  if (!job || job.projectId !== id) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ job, logs: listRenderLogs(jobId) });
}
