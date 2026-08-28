import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { createLink, reissueLink, getActiveLinkToken } from '@/lib/supplier-form/token';
import { writeAuditLog } from '@/lib/supplier-form/audit';

/** 링크를 만들거나 재발급할 권한: 프로젝트를 만든 본인 또는 admin (재발급은 기존 링크를
 * 폐기하는 민감한 동작이라 그대로 제한한다). */
async function assertLinkPermission(projectId: string) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 }) };
  const db = getDb();
  const project = db.prepare('SELECT created_by FROM supplier_request_projects WHERE id=?').get(projectId) as { created_by: string | null } | undefined;
  if (!project) return { error: NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 }) };
  if (user.role !== 'admin' && project.created_by !== user.id) {
    return { error: NextResponse.json({ error: '이 프로젝트의 링크를 생성/재발급할 권한이 없습니다.' }, { status: 403 }) };
  }
  return { user };
}

/** 링크 조회는 로그인한 그룹웨어 사용자면 누구나 가능 — 프로젝트 담당자가 아니어도 링크를 볼
 * 수 있어야 한다는 요청사항. 생성/재발급(POST)만 위 권한 제한을 그대로 유지한다. */
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
  const existing = db.prepare('SELECT id FROM supplier_request_links WHERE project_id=? AND is_active=1').get(id) as { id: string } | undefined;
  const body = await req.json().catch(() => ({}));
  const isReissue = !!existing;

  const { token } = isReissue
    ? reissueLink(id, user.id, user.name, body.reason || '보안상 링크 재발급')
    : createLink(id, user.id, user.name);

  writeAuditLog({
    projectId: id, action: isReissue ? 'link_reissue' : 'link_create',
    actorType: 'internal', actorUserId: user.id, actorUserName: user.name, req,
    after: { reason: body.reason },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return NextResponse.json({ data: { url: `${baseUrl}/supplier-form/${token}` } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await assertLoggedIn();
  if (check.error) return check.error;
  const db = getDb();
  const link = db.prepare('SELECT created_at FROM supplier_request_links WHERE project_id=? AND is_active=1').get(id) as { created_at: string } | undefined;
  // 링크를 만든 본인/admin이면 재발급 없이도 원문 링크를 다시 볼 수 있게 한다.
  const token = link ? getActiveLinkToken(id) : null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  return NextResponse.json({
    data: { hasActiveLink: !!link, createdAt: link?.created_at ?? null, url: token ? `${baseUrl}/supplier-form/${token}` : null },
  });
}
