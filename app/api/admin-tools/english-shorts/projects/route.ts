import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import {
  listProjects, insertProject, findExpressionByNormalized, insertExpression, normalizeExpression,
} from '@/lib/admin-tools/english-shorts/db';
import { writeEnglishShortsAuditLog } from '@/lib/admin-tools/english-shorts/audit';
import { requireEnglishShortsToolActive } from '@/lib/admin-tools/english-shorts/tool-status';

export async function GET(req: NextRequest) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const status = req.nextUrl.searchParams.get('status') as never;
  const search = req.nextUrl.searchParams.get('q') || undefined;
  return NextResponse.json({ projects: listProjects({ status: status || undefined, search }) });
}

/** 요청서 44번 — 정규화된 표현 기준 중복 감지. force가 없으면 이미 만든 프로젝트가
 * 있을 때 409로 막고 기존 프로젝트 목록을 돌려준다(자동으로 재사용하지 않음 —
 * "기존 프로젝트 보기" 또는 "그래도 새로 만들기"는 관리자가 직접 선택). */
export async function POST(req: NextRequest) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const toolActive = await requireEnglishShortsToolActive();
  if (!toolActive.ok) return toolActive.response;
  const { user } = auth;
  const body = await req.json().catch(() => ({}));
  const expressionText = typeof body.expression === 'string' ? body.expression.trim() : '';
  const force = !!body.force;
  if (!expressionText) return NextResponse.json({ error: '영어 표현을 입력하세요' }, { status: 400 });

  const normalized = normalizeExpression(expressionText);
  let expression = findExpressionByNormalized(normalized);
  if (!expression) {
    expression = insertExpression({ expression: expressionText, createdBy: user.id, createdByName: user.name });
  }

  if (!force) {
    const existingProjects = listProjects({ search: expressionText }).filter(p => p.expressionId === expression!.id);
    if (existingProjects.length > 0) {
      return NextResponse.json({ error: '이 표현으로 만든 프로젝트가 있습니다.', existingProjects }, { status: 409 });
    }
  }

  const project = insertProject(expression.id, user.id, user.name);
  writeEnglishShortsAuditLog({ projectId: project.id, userId: user.id, userName: user.name, action: 'PROJECT_CREATED', after: { expression: expressionText }, req });

  return NextResponse.json({ project }, { status: 201 });
}
