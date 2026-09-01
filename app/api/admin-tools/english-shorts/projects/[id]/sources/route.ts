import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import {
  getProjectById, listProjectSources, countProjectSources, attachProjectSource,
  getSourceById, reorderProjectSources, updateProject,
} from '@/lib/admin-tools/english-shorts/db';
import { getEnglishShortsSettings } from '@/lib/admin-tools/english-shorts/settings';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ sources: listProjectSources(id) });
}

/** 소스 추가 또는 순서 재배열 — body.reorder가 있으면 재배열, 아니면 부착.
 * 요청서 90번 — trim start/end는 서버에서도 반드시 재검증한다(0 <= start < end,
 * end는 실제 소스 duration을 넘을 수 없음 — duration을 모르면(ffprobe 실패) 상한
 * 검사는 건너뛴다). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (Array.isArray(body.reorder)) {
    const current = listProjectSources(id).map(ps => ps.id);
    const requested = body.reorder as string[];
    const sameSet = current.length === requested.length && current.every(id2 => requested.includes(id2));
    if (!sameSet) return NextResponse.json({ error: '유효하지 않은 순서 목록입니다' }, { status: 400 });
    reorderProjectSources(id, requested);
    return NextResponse.json({ sources: listProjectSources(id) });
  }

  const sourceId = typeof body.sourceId === 'string' ? body.sourceId : null;
  if (!sourceId) return NextResponse.json({ error: 'sourceId가 필요합니다' }, { status: 400 });
  const source = getSourceById(sourceId);
  if (!source || source.deletedAt) return NextResponse.json({ error: '소스를 찾을 수 없습니다' }, { status: 404 });

  const settings = getEnglishShortsSettings();
  const currentCount = countProjectSources(id);
  if (currentCount >= settings.maxClipsPerProject) {
    return NextResponse.json({ error: `프로젝트당 최대 ${settings.maxClipsPerProject}개까지 클립을 추가할 수 있습니다` }, { status: 400 });
  }

  let trimStart = typeof body.trimStartSec === 'number' ? body.trimStartSec : 0;
  let trimEnd = typeof body.trimEndSec === 'number' ? body.trimEndSec : null;
  if (trimStart < 0) trimStart = 0;
  if (trimEnd !== null) {
    if (trimEnd <= trimStart) return NextResponse.json({ error: '종료 시점은 시작 시점보다 커야 합니다' }, { status: 400 });
    if (source.durationSec != null && trimEnd > source.durationSec) trimEnd = source.durationSec;
  }
  if (source.durationSec != null && trimStart >= source.durationSec) {
    return NextResponse.json({ error: '시작 시점이 클립 길이를 넘었습니다' }, { status: 400 });
  }

  const link = attachProjectSource(id, sourceId, trimStart, trimEnd);

  // 소스가 하나라도 붙으면 draft -> source_required는 벗어난다(요청서 status 흐름).
  if (project.status === 'draft' || project.status === 'source_required') {
    updateProject(id, { status: 'ready' });
  }

  return NextResponse.json({ link }, { status: 201 });
}
