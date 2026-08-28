import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { checkChatGate } from '@/lib/ai/gate';
import { runChat, type PageContext } from '@/lib/ai/orchestrator';

interface ChatBody { message?: string; conversationId?: string; pageContext?: PageContext }

/** 일반 사용자가 보는 오류 메시지는 항상 이 한 문장으로 통일한다 — provider/Qdrant의
 * 실제 오류 원인은 ai_usage_logs에만 남기고, 화면에는 기술 용어를 노출하지 않는다. */
const FRIENDLY_FAILURE = '지금은 AI 도우미가 답변을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const gate = checkChatGate(user);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json() as ChatBody;
  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: '메시지를 입력해 주세요.' }, { status: 400 });

  try {
    const result = await runChat({ user, conversationId: body.conversationId, message, pageContext: body.pageContext });
    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json({ error: FRIENDLY_FAILURE }, { status: 502 });
  }
}
