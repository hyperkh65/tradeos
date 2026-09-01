import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import {
  findExpressionByNormalized, insertExpression, updateExpressionAiFields, normalizeExpression,
} from '@/lib/admin-tools/english-shorts/db';
import { analyzeExpression } from '@/lib/admin-tools/english-shorts/ai-analyze';
import { writeEnglishShortsAuditLog } from '@/lib/admin-tools/english-shorts/audit';

export const maxDuration = 120;

/** 정규화된 표현 기준으로 캐시 — 이미 분석된 표현이면 AI를 다시 호출하지 않는다
 * (요청서 10번). regenerate:true일 때만 실제로 재호출한다. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const body = await req.json().catch(() => ({}));
  const expressionText = typeof body.expression === 'string' ? body.expression.trim() : '';
  const regenerate = !!body.regenerate;
  if (!expressionText) return NextResponse.json({ error: '영어 표현을 입력하세요' }, { status: 400 });

  const normalized = normalizeExpression(expressionText);
  let expression = findExpressionByNormalized(normalized);

  const alreadyAnalyzed = !!expression?.koreanMeaning;
  if (expression && alreadyAnalyzed && !regenerate) {
    return NextResponse.json({ expression, cached: true });
  }

  let result;
  try {
    result = await analyzeExpression(expressionText, { userId: user.id, userName: user.name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  if (!expression) {
    expression = insertExpression({ expression: expressionText, createdBy: user.id, createdByName: user.name });
  }

  expression = updateExpressionAiFields(expression.id, {
    koreanMeaning: result.analysis.koreanMeaning,
    explanation: result.analysis.explanation,
    examples: result.analysis.examples,
    suggestedTitle: result.analysis.title,
    suggestedDescription: result.analysis.description,
    suggestedCaption: result.analysis.shortCaption,
    hashtags: result.analysis.hashtags,
    aiProviderId: result.providerId,
    aiModel: result.model,
    rawResponse: result.rawResponse,
  });

  writeEnglishShortsAuditLog({ userId: user.id, userName: user.name, action: 'AI_GENERATED', after: { expression: expressionText, providerId: result.providerId, model: result.model }, req });

  return NextResponse.json({ expression, cached: false });
}
