import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { createInspectionLink, reissueInspectionLink, getActiveInspectionLinkToken } from '@/lib/approval-inspection/token';
import { writeInspectionAuditLog } from '@/lib/approval-inspection/audit';

/** approval-documents/[id]/link/route.ts와 동일한 권한 정책: 생성/재발급은
 * 프로젝트 생성자 본인 또는 admin만, 조회는 로그인한 사용자 누구나. */
async function assertLinkPermission(projectId: string) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 }) };
  const db = getDb();
  const project = db.prepare('SELECT created_by FROM approval_inspection_projects WHERE id=? AND deleted=0').get(projectId) as { created_by: string | null } | undefined;
  if (!project) return { error: NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 }) };
  if (user.role !== 'admin' && project.created_by !== user.id) {
    return { error: NextResponse.json({ error: '이 프로젝트의 링크를 생성/재발급할 권한이 없습니다.' }, { status: 403 }) };
  }
  return { user };
}

async function assertLoggedIn() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 }) };
  return { user };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await assertLinkPermission(id);
  if (check.error) return check.error;
  const user = check.user!;

  const db = getDb();
  const existing = db.prepare('SELECT id FROM approval_inspection_links WHERE project_id=? AND is_active=1').get(id) as { id: string } | undefined;
  const body = await req.json().catch(() => ({}));
  const isReissue = !!existing;

  const { token } = isReissue
    ? reissueInspectionLink(id, user.id, user.name, body.reason || '보안상 링크 재발급')
    : createInspectionLink(id, user.id, user.name);

  writeInspectionAuditLog({
    projectId: id, action: isReissue ? 'link_reissue' : 'link_create',
    actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req,
    after: { reason: body.reason },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return NextResponse.json({ data: { url: `${baseUrl}/inspection-form/${token}` } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await assertLoggedIn();
  if (check.error) return check.error;
  const db = getDb();
  const link = db.prepare('SELECT created_at FROM approval_inspection_links WHERE project_id=? AND is_active=1').get(id) as { created_at: string } | undefined;
  const token = link ? getActiveInspectionLinkToken(id) : null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return NextResponse.json({
    data: { hasActiveLink: !!link, createdAt: link?.created_at ?? null, url: token ? `${baseUrl}/inspection-form/${token}` : null },
  });
}
