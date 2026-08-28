import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { checkChatGate } from '@/lib/ai/gate';
import { runChat, type PageContext } from '@/lib/ai/orchestrator';

interface ChatBody { message?: string; conversationId?: string; pageContext?: PageContext }

const FRIENDLY_FAILURE = '지금은 AI 도우미가 답변을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.';

/** 스트리밍 전용 채팅 엔드포인트 — 인증/기능활성화/요청한도 등 사전 검사가 실패하면
 * 스트림을 열지 않고 평범한 JSON 오류로 즉시 응답한다(그래야 클라이언트가 굳이
 * SSE 파서를 거치지 않고 바로 에러 처리할 수 있음). 통과하면 그때부터 text/event-stream으로 전환. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const gate = checkChatGate(user);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json() as ChatBody;
  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: '메시지를 입력해 주세요.' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { /* 클라이언트가 이미 연결을 끊음 */ }
      };
      try {
        const result = await runChat({
          user, conversationId: body.conversationId, message, pageContext: body.pageContext,
          onToken: delta => send({ type: 'token', delta }),
          signal: req.signal,
        });
        send({ type: 'done', conversationId: result.conversationId, sources: result.sources, toolCalls: result.toolCalls });
      } catch (e) {
        const aborted = (e as Error).name === 'AbortError' || req.signal.aborted;
        if (!aborted) send({ type: 'error', message: FRIENDLY_FAILURE });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
