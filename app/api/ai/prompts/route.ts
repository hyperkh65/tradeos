import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listPromptOverrides, setPromptOverride, type PromptKey } from '@/lib/ai/db';
import { DEFAULT_PROMPTS } from '@/lib/ai/prompts';

const KEYS: PromptKey[] = ['base', 'rag_answer', 'draft_writing', 'tool_selection'];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const overrides = listPromptOverrides();
  return NextResponse.json({
    data: KEYS.map(key => ({
      key,
      default: DEFAULT_PROMPTS[key],
      custom: overrides[key],
      effective: overrides[key] ?? DEFAULT_PROMPTS[key],
    })),
  });
}

/** value가 null이면 "기본값 복원", 문자열이면 커스텀 값으로 저장 */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });

  const body = await req.json() as { key?: PromptKey; value?: string | null };
  if (!body.key || !KEYS.includes(body.key)) return NextResponse.json({ error: '유효하지 않은 프롬프트 key입니다.' }, { status: 400 });

  setPromptOverride(body.key, body.value ?? null, user.id);
  return NextResponse.json({
    data: { key: body.key, default: DEFAULT_PROMPTS[body.key], custom: body.value ?? null, effective: body.value ?? DEFAULT_PROMPTS[body.key] },
  });
}
