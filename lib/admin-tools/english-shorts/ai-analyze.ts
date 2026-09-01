import { providerRouter } from '@/lib/ai/router';
import type { ChatMessage } from '@/lib/ai/types';

/**
 * 표현 하나를 분석해 필요한 필드를 전부 "한 번의 LLM 호출"로 받는다(요청서 10번 —
 * AI 호출 최소화). 이 프로젝트의 AI Provider Router에는 네이티브 JSON 모드가 없어,
 * lib/ai/orchestrator.ts의 DRAFT_INSTRUCTION_SCHEMA / lib/ai/client-page-context.ts의
 * extractDraftBlock과 동일한 방식(시스템 프롬프트로 fenced ```json 블록을 요청 →
 * 정규식 추출 → JSON.parse → 필드 존재 검증)을 그대로 재사용한다.
 */

export interface ExpressionAnalysis {
  koreanMeaning: string;
  explanation: string;
  examples: { en: string; ko: string }[];
  title: string;
  description: string;
  shortCaption: string;
  hashtags: string[];
}

const SYSTEM_PROMPT =
  '너는 영어 표현을 한국인 학습자를 위해 분석하는 도우미다. 사용자가 준 영어 표현/문장에 대해 ' +
  '설명 문장 없이 아래 스키마의 JSON 코드블록 하나만 답하라:\n' +
  '```json\n' +
  '{"koreanMeaning":"...", "explanation":"...", ' +
  '"examples":[{"en":"...","ko":"..."}, {"en":"...","ko":"..."}], ' +
  '"title":"...", "description":"...", "shortCaption":"...", "hashtags":["...", "..."]}\n' +
  '```\n' +
  '- koreanMeaning: 짧고 자연스러운 한국어 뜻(영상 위에 표시할 정도로 간결하게)\n' +
  '- explanation: 뉘앙스/사용법/짧은 문법 포인트 2~3문장\n' +
  '- examples: 실제 원어민이 쓰는 자연스러운 예문 2~4개(en/ko 쌍)\n' +
  '- title: 유튜브 Shorts 제목 후보 1개(한국어, #shorts 포함 가능)\n' +
  '- description: 유튜브 설명문 2~4문장\n' +
  '- shortCaption: 영상 하단에 표시할 아주 짧은 한글 뜻(10자 내외)\n' +
  '- hashtags: # 없이 5~8개, 한국어/영어 혼용 가능\n' +
  '- 이모지는 절대 포함하지 마라(자막 번인에서 깨지는 문제가 있어 별도 처리한다).';

function extractJsonBlock(text: string): Record<string, unknown> | null {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  const raw = m ? m[1] : text.trim();
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function validateAnalysis(obj: Record<string, unknown>): ExpressionAnalysis | null {
  const koreanMeaning = obj.koreanMeaning;
  const explanation = obj.explanation;
  const examples = obj.examples;
  const title = obj.title;
  const description = obj.description;
  const shortCaption = obj.shortCaption;
  const hashtags = obj.hashtags;

  if (typeof koreanMeaning !== 'string' || !koreanMeaning) return null;
  if (typeof explanation !== 'string' || !explanation) return null;
  if (!Array.isArray(examples) || examples.length === 0) return null;
  for (const ex of examples) {
    if (!ex || typeof ex !== 'object' || typeof (ex as Record<string, unknown>).en !== 'string' || typeof (ex as Record<string, unknown>).ko !== 'string') return null;
  }
  if (typeof title !== 'string' || !title) return null;
  if (typeof description !== 'string' || !description) return null;
  if (typeof shortCaption !== 'string' || !shortCaption) return null;
  if (!Array.isArray(hashtags) || hashtags.some(h => typeof h !== 'string')) return null;

  return {
    koreanMeaning, explanation,
    examples: examples as { en: string; ko: string }[],
    title, description, shortCaption,
    hashtags: hashtags as string[],
  };
}

export interface AnalyzeExpressionResult {
  analysis: ExpressionAnalysis;
  providerId: string;
  providerName: string;
  model: string;
  rawResponse: string;
}

/** AI 결과를 신뢰하지 않는다(요청서 90번) — fenced JSON을 못 찾거나 필수 필드가
 * 없으면 가짜 값을 채우지 않고 명확한 에러를 던진다. */
export async function analyzeExpression(expression: string, ctx: { userId: string; userName: string }): Promise<AnalyzeExpressionResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: expression },
  ];

  // maxTokens는 900이었으나 실제로는 502(빈 응답)가 계속 발생했다 — 기본 모델
  // (@cf/zai-org/glm-4.7-flash)가 추론(reasoning) 토큰을 먼저 소비하는 모델이라
  // 900으로는 reasoning만 채우고 실제 답변(content)이 비어버린다(OpenAIProvider는
  // choices[0].message.content만 읽고 reasoning_content는 보지 않음, lib/ai/providers/openai.ts:77).
  // 실제 프로덕션 호출로 재현/확인 후 4000으로 올려 재검증함(Phase 22).
  const result = await providerRouter.chat(messages, { maxTokens: 4000, temperature: 0.4 }, { userId: ctx.userId, userName: ctx.userName });

  const parsed = extractJsonBlock(result.content);
  if (!parsed) {
    throw new Error('AI 응답에서 유효한 JSON을 추출하지 못했습니다.');
  }
  const analysis = validateAnalysis(parsed);
  if (!analysis) {
    throw new Error('AI 응답에 필요한 필드가 누락되었습니다.');
  }

  return { analysis, providerId: result.providerId, providerName: result.providerName, model: result.model, rawResponse: result.content };
}
