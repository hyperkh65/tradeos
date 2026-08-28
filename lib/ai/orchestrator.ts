import { providerRouter } from './router';
import { getEffectivePrompt } from './prompts';
import { listToolSchemas } from './tools/registry';
import { executeTool } from './tools/executor';
import { createConversation, getConversation, touchConversation, addMessage, listMessages } from './db';
import type { User } from '@/types';
import type { ChatMessage, ChatResult } from './types';

export interface PageContext { module?: string; entityType?: string; entityId?: string; title?: string; route?: string }
export interface AISourceRef { sourceType: string; sourceId: string; title: string; score?: number; businessId?: string }
export interface RunChatResult { conversationId: string; reply: string; sources: AISourceRef[]; toolCalls: { name: string; args: unknown }[] }

/** 도구 이름 → 출처 유형. 정규식으로 복수형을 벗기는 방식은 Companies→Companie처럼
 * 깨지는 경우가 있어, 명시적으로 나열한다(도구를 추가할 때 여기 한 줄만 추가하면 됨). */
const TOOL_SOURCE_TYPE: Record<string, string> = {
  searchProducts: 'product', getProduct: 'product',
  searchInspections: 'inspection', getInspection: 'inspection',
  searchClaims: 'claim', getClaim: 'claim',
  searchCompanies: 'company', getCompany: 'company',
  searchPurchaseOrders: 'purchaseorder', getPurchaseOrder: 'purchaseorder',
  searchShipments: 'shipment',
};

/** 도구 호출을 몇 번까지 왕복할지 상한 — 비용 제어 겸 무한루프 방지.
 * "질문에 맞는 도구만 최소한으로" 원칙은 프롬프트(tool_selection)로 유도하고,
 * 여기서는 안전장치로만 상한을 둔다. */
const MAX_TOOL_ROUNDS = 2;
const MAX_HISTORY_MESSAGES = 20;

function buildContextLine(ctx?: PageContext): string {
  if (!ctx) return '';
  const parts = [ctx.module, ctx.entityType, ctx.title].filter(Boolean).join(' / ');
  if (!parts) return '';
  return `\n\n[현재 사용자가 보고 있는 화면] ${parts}${ctx.route ? ` (${ctx.route})` : ''}`;
}

function toolResultToSources(name: string, result: unknown): AISourceRef[] {
  if (!result) return [];
  const rows = Array.isArray(result) ? result : [result];
  return rows.slice(0, 10).map((r: unknown) => {
    const row = r as Record<string, unknown>;
    if (name === 'searchKnowledge') {
      return {
        sourceType: String(row.sourceType), sourceId: String(row.sourceId), title: String(row.title),
        score: row.score as number | undefined, businessId: row.businessId as string | undefined,
      };
    }
    const sourceType = TOOL_SOURCE_TYPE[name] || name;
    const title = row.name_ko ?? row.name ?? row.business_id ?? row.title ?? row.id;
    return { sourceType, sourceId: String(row.id ?? ''), title: String(title ?? ''), businessId: row.business_id as string | undefined };
  }).filter(s => s.sourceId);
}

/** 스트리밍이 요청된 최종 답변 호출의 결과를 소비한다 — provider가 실제로 스트리밍했으면
 * (tool_calls가 필요 없는 순수 답변 호출에서만 일어남) 토큰이 오는 대로 onToken을 호출하며
 * 누적하고, 스트리밍하지 않았으면(도구가 함께 제공된 중간 라운드 등) 완성된 답변을
 * 한 번에 onToken으로 넘겨 같은 인터페이스로 전달한다("점진적 스트리밍 실패 시 비스트리밍
 * 결과로 자연스럽게 대체"라는 요구사항을 이 한 함수로 만족). */
async function deliverResult(result: ChatResult, onToken?: (delta: string) => void): Promise<string> {
  if (result.stream) {
    let acc = '';
    for await (const delta of result.stream) {
      acc += delta;
      onToken?.(delta);
    }
    return acc;
  }
  if (onToken && result.content) onToken(result.content);
  return result.content;
}

/** 이 프로젝트의 "Intent Router"는 별도 분류기를 두지 않고, LLM의 function-calling
 * 자체가 그 역할을 겸한다 — tool_selection 프롬프트가 "구조화된 사실은 DB 도구,
 * 의미 기반 질문은 searchKnowledge(RAG)"를 우선하도록 유도하고, LLM이 매 질문마다
 * 어떤 도구를 얼마나 쓸지 스스로 고른다. 규칙 기반 분류기를 별도로 유지하는 것보다
 * 단순하고, 프롬프트만 조정하면 라우팅 정책을 바꿀 수 있다는 장점이 있다.
 *
 * onToken을 넘기면 스트리밍을 시도한다 — 다만 도구 호출 여부를 판단하려면 완전한
 * 응답이 필요하므로, 도구가 함께 제공되는 호출은 항상 버퍼링되고, 더 이상 도구를
 * 제안하지 않는 마지막 라운드(또는 애초에 도구가 필요 없었던 첫 응답)만 실제로
 * 토큰 단위로 스트리밍된다. */
export async function runChat(opts: {
  user: User;
  conversationId?: string;
  message: string;
  pageContext?: PageContext;
  onToken?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<RunChatResult> {
  let conversation = opts.conversationId ? getConversation(opts.conversationId) : null;
  if (!conversation || conversation.userId !== opts.user.id) {
    conversation = createConversation(opts.user.id, opts.user.name, opts.message.slice(0, 40));
  }

  const history = listMessages(conversation.id, MAX_HISTORY_MESSAGES);
  addMessage({ conversationId: conversation.id, role: 'user', content: opts.message });

  const draftInstruction = '\n\n사용자가 문서 초안 작성을 요청하면, 답변 마지막에 아래 형태의 코드블록을 포함하라'
    + '(그 앞에 자연어로 간단히 설명해도 됨). 이 JSON은 사용자가 직접 확인 후 적용하는 미리보기용이며,'
    + ' 절대 스스로 최종 등록/발송된 것처럼 말하지 마라.\n'
    + '- 클레임 등록 초안: ```json\\n{"type":"claimDraft","title":"...",'
    + '"fields":{"issueType":"품질|납기|수량|기타","description":"...","customerName":"...","supplierName":"...","productName":"...","claimAmount":숫자,"currency":"USD"}}\\n```'
    + '("claimDraft"인 경우, 사용자가 현재 클레임 화면에 있으면 "적용" 버튼으로 등록 모달에 필드가 자동으로 채워진다 — 아는 필드만 채우고 모르면 생략)\n'
    + '- 이메일/검사보고서/회의록 등 자유서식 문서: ```json\\n{"type":"emailDraft|reportDraft|memoDraft","title":"...","content":"..."}\\n```';
  const systemPrompt = getEffectivePrompt('base') + draftInstruction + buildContextLine(opts.pageContext);
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.filter(h => h.role === 'user' || h.role === 'assistant').map(h => ({ role: h.role as 'user' | 'assistant', content: h.content || '' })),
    { role: 'user', content: opts.message },
  ];

  const tools = listToolSchemas();
  const toolCtx = { user: opts.user, conversationId: conversation.id };
  const allToolCalls: { name: string; args: unknown }[] = [];
  const allSources: AISourceRef[] = [];

  const chatCtx = { conversationId: conversation.id, userId: opts.user.id, userName: opts.user.name };
  let final = await providerRouter.chat(messages, { tools, signal: opts.signal }, chatCtx);
  let finalContent: string;

  if (!final.toolCalls?.length) {
    // 도구가 아예 필요 없었던 경우 — 이 첫 호출이 이미 최종 답변이다(재생성 없이 그대로 전달).
    finalContent = await deliverResult(final, opts.onToken);
  } else {
    let round = 0;
    let streamedThisRound = false;
    while (final.toolCalls?.length && round < MAX_TOOL_ROUNDS) {
      round++;
      messages.push({ role: 'assistant', content: final.content || '' });
      for (const call of final.toolCalls) {
        const execResult = await executeTool(call.name, call.arguments, toolCtx);
        allToolCalls.push({ name: call.name, args: call.arguments });
        if (execResult.ok) allSources.push(...toolResultToSources(call.name, execResult.result));
        messages.push({
          role: 'tool',
          content: JSON.stringify(execResult.ok ? { tool: call.name, result: execResult.result } : { tool: call.name, error: execResult.error }),
        });
      }
      messages.push({ role: 'system', content: getEffectivePrompt('rag_answer') });
      const isLastRound = round >= MAX_TOOL_ROUNDS;
      try {
        final = await providerRouter.chat(messages, { tools: isLastRound ? undefined : tools, stream: isLastRound && !!opts.onToken, signal: opts.signal }, chatCtx);
        streamedThisRound = isLastRound;
      } catch {
        // 도구 응답을 반영한 후속 호출이 실패해도(예: provider 오류) 이미 얻은 도구 결과는
        // 있으므로, 빈 오류로 끝내지 않고 최소한의 안내 답변으로 대체한다.
        final = { content: '자료는 찾았지만 답변 생성 중 오류가 발생했습니다. 아래 출처를 직접 확인해 주세요.', model: final.model, providerId: final.providerId, providerName: final.providerName };
        break;
      }
    }
    if (streamedThisRound) {
      finalContent = await deliverResult(final, opts.onToken);
    } else {
      opts.onToken?.(final.content);
      finalContent = final.content;
    }
  }

  const dedupedSources = Array.from(new Map(allSources.map(s => [`${s.sourceType}:${s.sourceId}`, s])).values());

  addMessage({
    conversationId: conversation.id, role: 'assistant', content: finalContent,
    providerId: final.providerId, model: final.model, toolCalls: allToolCalls, sources: dedupedSources,
  });
  touchConversation(conversation.id);

  return { conversationId: conversation.id, reply: finalContent, sources: dedupedSources, toolCalls: allToolCalls };
}
