import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { getProjectById, listProjectSources, updateProjectSource, detachProjectSource, getSourceById } from '@/lib/admin-tools/english-shorts/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { id, linkId } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const link = listProjectSources(id).find(l => l.id === linkId);
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const source = getSourceById(link.sourceId);

  let trimStart = typeof body.trimStartSec === 'number' ? body.trimStartSec : link.trimStartSec;
  let trimEnd = body.trimEndSec !== undefined ? body.trimEndSec : link.trimEndSec;
  if (trimStart < 0) trimStart = 0;
  if (trimEnd !== null && trimEnd !== undefined) {
    if (trimEnd <= trimStart) return NextResponse.json({ error: '종료 시점은 시작 시점보다 커야 합니다' }, { status: 400 });
    if (source?.durationSec != null && trimEnd > source.durationSec) trimEnd = source.durationSec;
  }

  updateProjectSource(linkId, {
    trimStartSec: trimStart,
    trimEndSec: trimEnd,
    clipLabel: typeof body.clipLabel === 'string' ? body.clipLabel : undefined,
  });

  return NextResponse.json({ sources: listProjectSources(id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { id, linkId } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ok = detachProjectSource(linkId);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ sources: listProjectSources(id) });
}
