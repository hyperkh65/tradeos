import { providerRouter } from './router';
import { getEffectivePrompt } from './prompts';
import { listToolSchemas } from './tools/registry';
import { executeTool } from './tools/executor';
import { createConversation, getConversation, touchConversation, addMessage, listMessages, countMessages } from './db';
import { classifyIntent, type IntentKind } from './intent';
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
  searchQuotes: 'quote', getQuote: 'quote',
  searchSales: 'sale', getSale: 'sale',
  searchInventory: 'inventory',
  searchImports: 'import', getImport: 'import',
  searchExpenses: 'expense',
  searchCommissions: 'commission', getCommission: 'commission',
  searchEmployees: 'employee',
};

/** 도구 호출을 몇 번까지 왕복할지 상한 — 비용 제어 겸 무한루프 방지.
 * "질문에 맞는 도구만 최소한으로" 원칙은 프롬프트(tool_selection)로 유도하고,
 * 여기서는 안전장치로만 상한을 둔다. */
const MAX_TOOL_ROUNDS = 2;
/** 전체 대화 history를 계속 모델에 넣지 않는다 — 최근 6개만. 대화가 길어지면
 * listMessages()가 항상 "최근" limit개를 돌려주므로(과거엔 ASC+LIMIT라 항상
 * 가장 오래된 메시지만 보이는 버그가 있었음, db.ts에서 수정됨) 오래된 맥락은
 * 자연히 잘려나가고, 그 사실만 한 줄로 모델에 알린다(추가 LLM 호출로 요약하지 않음
 * — 요약 자체가 비용 절감 목표에 역행하므로). */
const MAX_HISTORY_MESSAGES = 6;
const TEMPERATURE = 0.2;

function maxTokensFor(kind: IntentKind): number | undefined {
  switch (kind) {
    case 'general': return 400;
    case 'db': return 300;
    case 'rag': return 650;
    case 'mixed': return 650;
    case 'draft': return undefined; // 스키마 기반 — 기존처럼 미제한
  }
}

function buildContextLine(ctx?: PageContext): string {
  if (!ctx) return '';
  const parts = [ctx.module, ctx.entityType, ctx.title].filter(Boolean).join(' / ');
  if (!parts) return '';
  // "이 제품/이 건" 같은 지시어가 나오면 지금 보고 있는 화면을 정확히 가리키게 고정한다 —
  // 비슷한 이름의 다른 레코드가 검색어에 섞여 들어가는 것을 방지(예: 제품 상세 화면에서
  // "이 제품 예전에 비슷한 문제 있었어?"라고 물었을 때 다른 유사 제품과 혼동하지 않도록).
  const pin = ctx.entityId && ctx.title
    ? ` "이 제품/이 건/이거/해당 건"처럼 화면을 가리키는 표현이 나오면 정확히 "${ctx.title}"만 뜻한다 — 검색 도구를 쓸 때 이름이 비슷한 다른 항목과 섞지 말고 이 제목을 정확한 검색어로 사용하라.`
    : '';
  return `\n\n[현재 사용자가 보고 있는 화면] ${parts}${ctx.route ? ` (${ctx.route})` : ''}${pin}`;
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
    const title = row.name_ko ?? row.name ?? row.company_name ?? row.customer ?? row.product_name
      ?? row.foreign_company ?? row.description ?? row.business_id ?? row.title ?? row.id;
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

const DRAFT_INSTRUCTION_SCHEMA = '사용자가 문서 초안 작성을 요청하면, 답변 마지막에 아래 형태의 코드블록을 포함하라'
  + '(그 앞에 자연어로 간단히 설명해도 됨). 이 JSON은 사용자가 직접 확인 후 적용하는 미리보기용이며,'
  + ' 절대 스스로 최종 등록/발송된 것처럼 말하지 마라.\n'
  + '- 클레임 등록 초안: ```json\\n{"type":"claimDraft","title":"...",'
  + '"fields":{"issueType":"품질|납기|수량|기타","description":"...","customerName":"...","supplierName":"...","productName":"...","claimAmount":숫자,"currency":"USD"}}\\n```'
  + '("claimDraft"인 경우, 사용자가 현재 클레임 화면에 있으면 "적용" 버튼으로 등록 모달에 필드가 자동으로 채워진다 — 아는 필드만 채우고 모르면 생략)\n'
  + '- 이메일/검사보고서/회의록 등 자유서식 문서: ```json\\n{"type":"emailDraft|reportDraft|memoDraft","title":"...","content":"..."}\\n```';

/** 이 프로젝트의 "Intent Router"(lib/ai/intent.ts)는 정규식 기반이다 — LLM 분류
 * 호출을 별도로 두지 않고, 매 요청마다 0원으로 (1) 아예 도구가 필요 없는 일반 질문을
 * 걸러내고, (2) DB 질문이면 관련 있는 도구 그룹만 골라서 보내고, (3) 아주 흔한 단순
 * DB 질문 몇 가지는 도구 선택 라운드 자체를 건너뛰고 바로 실행한다(Deterministic
 * Fast Path). 애매한 경우엔 항상 더 넓게 fallback해서 "관련 자료를 찾지 못했습니다"로
 * 잘못 새는 것을 방지한다. */
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

  const totalMessageCount = countMessages(conversation.id);
  const history = listMessages(conversation.id, MAX_HISTORY_MESSAGES);
  const omittedCount = Math.max(0, totalMessageCount - history.length);
  addMessage({ conversationId: conversation.id, role: 'user', content: opts.message });

  const intent = classifyIntent(opts.message);
  const chatCtx = { conversationId: conversation.id, userId: opts.user.id, userName: opts.user.name };
  const toolCtx = { user: opts.user, conversationId: conversation.id };

  // "이번 달/이번 주/최근 N일" 같은 상대적 기간 질문은 모델이 오늘 날짜를 알아야
  // dateFrom/dateTo를 계산해서 도구를 호출할 수 있다(모르면 그냥 "찾지 못했다"고 답해버림).
  const todayLine = `\n\n오늘 날짜는 ${new Date().toISOString().slice(0, 10)}이다. "이번 달/이번 주/최근 N일" 같은 상대적 기간 질문은 이 날짜를 기준으로 dateFrom/dateTo를 계산해서 검색 도구를 호출하라 (예: "이번 달"이면 이번 달 1일 ~ 오늘).`;
  // 전체 history를 계속 보내지 않고 최근 것만 보내므로(비용 절감), 잘려나간 게 있으면
  // 그 사실만 한 줄로 알린다 — 별도 LLM 호출로 요약하지 않는다(요약 자체가 비용 절감
  // 목표에 역행하므로).
  const omittedLine = omittedCount > 0 ? `\n\n(참고: 이전 대화 ${omittedCount}건은 맥락에서 생략됨)` : '';
  const baseSystem = getEffectivePrompt('base') + todayLine + omittedLine + buildContextLine(opts.pageContext);

  // ── Deterministic Fast Path: 아주 흔한 단순 DB 질문은 "도구 선택" LLM 호출 자체를
  // 건너뛰고 바로 도구를 실행한 뒤, 짧은 답변 생성 1회만 호출한다(도구 선택 1회 +
  // 답변 1회로 두 번 호출하던 것을 한 번으로 줄임). ──
  if (intent.fastPath) {
    const execResult = await executeTool(intent.fastPath.toolName, intent.fastPath.args, toolCtx);
    const sources = execResult.ok ? toolResultToSources(intent.fastPath.toolName, execResult.result) : [];
    const messages: ChatMessage[] = [
      { role: 'system', content: baseSystem },
      ...history.filter(h => h.role === 'user' || h.role === 'assistant').map(h => ({ role: h.role as 'user' | 'assistant', content: h.content || '' })),
      { role: 'user', content: opts.message },
      { role: 'tool', content: JSON.stringify(execResult.ok ? { tool: intent.fastPath.toolName, result: execResult.result } : { tool: intent.fastPath.toolName, error: execResult.error }) },
    ];
    const result = await providerRouter.chat(messages, { maxTokens: 120, temperature: TEMPERATURE, stream: !!opts.onToken, signal: opts.signal }, chatCtx);
    const finalContent = await deliverResult(result, opts.onToken);
    addMessage({
      conversationId: conversation.id, role: 'assistant', content: finalContent,
      providerId: result.providerId, model: result.model, toolCalls: [{ name: intent.fastPath.toolName, args: intent.fastPath.args }], sources,
    });
    touchConversation(conversation.id);
    return { conversationId: conversation.id, reply: finalContent, sources, toolCalls: [{ name: intent.fastPath.toolName, args: intent.fastPath.args }] };
  }

  const tools = intent.kind === 'general'
    ? []
    : intent.kind === 'draft'
      ? listToolSchemas()
      : listToolSchemas(intent.toolGroups);

  let systemPrompt = baseSystem;
  if (intent.kind === 'draft') systemPrompt += '\n\n' + getEffectivePrompt('draft_writing') + '\n\n' + DRAFT_INSTRUCTION_SCHEMA;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(tools.length > 1 ? [{ role: 'system' as const, content: getEffectivePrompt('tool_selection') }] : []),
    ...history.filter(h => h.role === 'user' || h.role === 'assistant').map(h => ({ role: h.role as 'user' | 'assistant', content: h.content || '' })),
    { role: 'user', content: opts.message },
  ];

  const allToolCalls: { name: string; args: unknown }[] = [];
  const allSources: AISourceRef[] = [];
  const maxTokens = maxTokensFor(intent.kind);

  let final = await providerRouter.chat(messages, { tools: tools.length ? tools : undefined, maxTokens, temperature: TEMPERATURE, signal: opts.signal }, chatCtx);
  let finalContent: string;

  if (!final.toolCalls?.length) {
    // 도구가 아예 필요 없었던 경우(또는 tools=[]라 애초에 못 부름) — 이 첫 호출이
    // 이미 최종 답변이다(재생성 없이 그대로 전달).
    finalContent = await deliverResult(final, opts.onToken);
  } else {
    let round = 0;
    let streamedThisRound = false;
    while (final.toolCalls?.length && round < MAX_TOOL_ROUNDS) {
      round++;
      messages.push({ role: 'assistant', content: final.content || '' });
      let calledSearchKnowledge = false;
      for (const call of final.toolCalls) {
        if (call.name === 'searchKnowledge') calledSearchKnowledge = true;
        const execResult = await executeTool(call.name, call.arguments, toolCtx);
        allToolCalls.push({ name: call.name, args: call.arguments });
        if (execResult.ok) allSources.push(...toolResultToSources(call.name, execResult.result));
        messages.push({
          role: 'tool',
          content: JSON.stringify(execResult.ok ? { tool: call.name, result: execResult.result } : { tool: call.name, error: execResult.error }),
        });
      }
      // RAG 프롬프트는 실제로 searchKnowledge를 쓴 라운드에만 붙인다 — DB 전용
      // 질문에는 "출처를 나열하라" 같은 RAG 전용 지시가 섞여 들어갈 이유가 없다.
      if (calledSearchKnowledge) messages.push({ role: 'system', content: getEffectivePrompt('rag_answer') });
      const isLastRound = round >= MAX_TOOL_ROUNDS;
      try {
        final = await providerRouter.chat(
          messages,
          { tools: isLastRound ? undefined : (tools.length ? tools : undefined), stream: isLastRound && !!opts.onToken, maxTokens, temperature: TEMPERATURE, signal: opts.signal },
          chatCtx,
        );
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
