import { getToolByName } from './registry';
import { logToolCall } from '../db';
import type { ToolContext } from './types';

export interface ToolExecutionResult {
  name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** 모든 도구 호출은 이 함수를 반드시 거친다 — 미등록 도구 차단, 실행시간 측정,
 * 성공/실패/거부 사유를 ai_tool_logs에 감사 기록으로 남긴다(AI가 로그인한 사용자
 * 권한 밖으로 나갈 수 없다는 것을 사후에도 확인할 수 있어야 하므로). */
export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
  const started = Date.now();
  const tool = getToolByName(name);
  if (!tool) {
    logToolCall({ conversationId: ctx.conversationId, messageId: ctx.messageId, userId: ctx.user.id, toolName: name, args, allowed: false, deniedReason: '등록되지 않은 도구', latencyMs: Date.now() - started });
    return { name, ok: false, error: '등록되지 않은 도구입니다.' };
  }
  if (!ctx.user) {
    logToolCall({ conversationId: ctx.conversationId, messageId: ctx.messageId, userId: null, toolName: name, args, allowed: false, deniedReason: '로그인 필요', latencyMs: Date.now() - started });
    return { name, ok: false, error: '로그인이 필요합니다.' };
  }
  try {
    const result = await tool.handler(args, ctx);
    const summary = Array.isArray(result) ? `${result.length}건` : (result ? '1건' : '결과 없음');
    logToolCall({ conversationId: ctx.conversationId, messageId: ctx.messageId, userId: ctx.user.id, toolName: name, args, resultSummary: summary, allowed: true, latencyMs: Date.now() - started });
    return { name, ok: true, result };
  } catch (e) {
    logToolCall({ conversationId: ctx.conversationId, messageId: ctx.messageId, userId: ctx.user.id, toolName: name, args, allowed: true, deniedReason: (e as Error).message, latencyMs: Date.now() - started });
    return { name, ok: false, error: (e as Error).message };
  }
}
