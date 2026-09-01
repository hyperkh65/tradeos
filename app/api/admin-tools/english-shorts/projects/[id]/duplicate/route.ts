import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { getProjectById, duplicateProject } from '@/lib/admin-tools/english-shorts/db';
import { writeEnglishShortsAuditLog } from '@/lib/admin-tools/english-shorts/audit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const { id } = await params;
  const project = getProjectById(id);
  if (!project || project.deletedAt) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const duplicate = duplicateProject(id, user.id, user.name);
  writeEnglishShortsAuditLog({ projectId: duplicate.id, userId: user.id, userName: user.name, action: 'PROJECT_CREATED', after: { duplicatedFrom: id }, req });

  return NextResponse.json({ project: duplicate }, { status: 201 });
}
