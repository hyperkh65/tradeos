import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { getProjectById, updateProject, softDeleteProject, getExpressionById } from '@/lib/admin-tools/english-shorts/db';
import { writeEnglishShortsAuditLog } from '@/lib/admin-tools/english-shorts/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const expression = getExpressionById(project.expressionId);
  return NextResponse.json({ project, expression });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const k of ['title', 'description', 'caption', 'templateId'] as const) {
    if (k in body) patch[k] = body[k];
  }
  if (Array.isArray(body.hashtags)) patch.hashtags = body.hashtags;
  if (body.templateSettings && typeof body.templateSettings === 'object') patch.templateSettings = body.templateSettings;

  const updated = updateProject(id, patch);
  return NextResponse.json({ project: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const { id } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ok = softDeleteProject(id, user.id);
  if (!ok) return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  writeEnglishShortsAuditLog({ projectId: id, userId: user.id, userName: user.name, action: 'PROJECT_DELETED', req });
  return NextResponse.json({ ok: true });
}
