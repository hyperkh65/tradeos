/**
 * 정규식/키워드 기반 Intent Router — LLM 호출 없이(비용 0) 질문을 분류해서
 * (1) Qdrant/DB 도구를 아예 안 보내도 되는 일반 질문을 걸러내고,
 * (2) DB 질문은 관련 있는 도구 그룹만 골라 보내고,
 * (3) 아주 흔한 단순 DB 질문 몇 가지는 LLM의 "도구 선택" 라운드 자체를 건너뛰고
 *     바로 도구를 호출해서 답변 생성 1회만 호출하게 한다(Deterministic Fast Path).
 *
 * 애매하면(둘 다 매치되거나, 판단이 안 서면) 항상 더 넓은 그룹을 주는 쪽으로 fallback한다
 * — 잘못 좁혀서 "관련 자료를 찾지 못했습니다"가 나오는 것보다, 도구 몇 개 더 주는 비용이 낫다.
 */

export type IntentKind = 'general' | 'db' | 'rag' | 'mixed' | 'draft';

export interface FastPathMatch { toolName: string; args: Record<string, unknown> }

export interface IntentResult { kind: IntentKind; toolGroups: string[]; fastPath?: FastPathMatch }

const DB_KEYWORD_GROUPS: Record<string, RegExp> = {
  inventory: /재고|입고\s*수량|출고|보관\s*위치/,
  trade: /발주|PO[-\s]?\d|수입\s*통관|통관|선적|관세|부가세|ETD|ETA|B\/?L\b|포워더|운임/i,
  sales: /매출|견적|판매|고객사|주문/,
  quality: /검품|불량|하자|품질/,
  accounting: /비용|회계|미수금|입출금|송금|커미션|수수료|전표|원가/,
  hr: /직원|부서|사번/,
  // "OO 주소가 뭐야"류는 "가 뭐야" 패턴에 걸려 definitional(general)로 잘못 빠지기
  // 쉽다 — 거래처 정보 질문은 반드시 DB 도구(searchCompanies) 대상이라 별도 그룹으로 뺀다.
  company: /주소|대표자?|사업자\s*번호|담당자|계좌|연락처|전화번호|은행|거래처/,
};

const RAG_KEYWORDS = /예전|과거|이전에|비슷한|회의록|사양서|메모|히스토리|기록.{0,4}있|있었/;
const CLAIM_KEYWORD = /클레임/; // quality 그룹에 속하지만 별도 정규식(불량/하자와 겹치지 않는 경우 대비)

const DRAFT_KEYWORDS = /초안|작성해\s*줘|작성해줘|써\s*줘|써줘|등록해\s*줘|등록해줘|메일.{0,6}(써|작성)|보고서.{0,6}작성/;

/** "FOB가 뭐야?" 류 순수 정의/설명 질문 — 회사 데이터가 아니라 일반 지식으로 답할 수 있는
 * 질문. 아래 두 조건(업체/제품 코드로 보이는 대문자+숫자 토큰이 없고, DB/RAG 키워드도
 * 전혀 없음)을 모두 만족할 때만 성립한다 — "T3가 뭐야?"처럼 실제로는 제품 조회인 경우를
 * general로 잘못 보내지 않기 위한 안전장치. */
const DEFINITIONAL_PATTERN = /(이|가)\s*(뭐(야|예요|죠|니|임)|뭔가요)|무슨\s*(뜻|의미)|뜻이\s*뭐|차이가\s*뭐|어떻게\s*하는\s*거|설명해\s*줘|정의가\s*뭐|뭔지\s*(알려|궁금)/;
const CODE_TOKEN_PATTERN = /\b[A-Z]{1,6}[-]?\d{1,6}\b/; // T3, PO-2026-0001, QC-001 등 업무 코드로 보이는 토큰

function matchedDbGroups(message: string): string[] {
  const groups: string[] = [];
  for (const [group, re] of Object.entries(DB_KEYWORD_GROUPS)) {
    if (re.test(message)) groups.push(group);
  }
  if (CLAIM_KEYWORD.test(message) && !groups.includes('quality')) groups.push('quality');
  return groups;
}

/** 흔한 단순 DB 질문 몇 가지만 직접 매칭한다 — 매칭되면 orchestrator가 LLM의
 * 도구 선택 라운드를 건너뛰고 바로 도구를 호출한 뒤, 답변 생성 1회만 호출한다. */
function matchFastPath(message: string): FastPathMatch | undefined {
  const stockMatch = message.match(/([\w가-힣0-9\-]+)\s*(?:의\s*)?재고\s*(?:가|는|이)?\s*(?:몇\s*(?:개|박스|대|세트)|얼마)/);
  if (stockMatch) {
    const query = stockMatch[1].replace(/^(현재|지금)\s*/, '').trim();
    if (query) return { toolName: 'searchInventory', args: { query, limit: 10 } };
  }

  const poCountMatch = message.match(/이번\s*달.{0,4}(입고|발주).{0,6}(몇\s*건|건수)/);
  if (poCountMatch) {
    const now = new Date();
    const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const dateTo = now.toISOString().slice(0, 10);
    return { toolName: 'searchPurchaseOrders', args: { dateFrom, dateTo, limit: 50 } };
  }

  return undefined;
}

export function classifyIntent(message: string): IntentResult {
  const draftMatch = DRAFT_KEYWORDS.test(message);
  if (draftMatch) return { kind: 'draft', toolGroups: [] }; // draft는 저빈도/고가치라 전체 도구 접근 유지(orchestrator에서 undefined로 처리)

  const dbGroups = matchedDbGroups(message);
  const ragMatch = RAG_KEYWORDS.test(message);

  if (dbGroups.length === 0 && !ragMatch) {
    const isDefinitional = DEFINITIONAL_PATTERN.test(message) && !CODE_TOKEN_PATTERN.test(message);
    if (isDefinitional) return { kind: 'general', toolGroups: [] };
    // 키워드가 안 걸렸지만 정의성 질문도 아니면(예: 흔치 않은 표현으로 물어본 업무 질문)
    // 안전하게 "mixed"로 보내 전체 db+rag 그룹을 준다 — 잘못 좁혀서 못 찾는 것을 방지.
    return { kind: 'mixed', toolGroups: [...Object.keys(DB_KEYWORD_GROUPS), 'company', 'quality'] };
  }

  if (dbGroups.length > 0 && ragMatch) {
    return { kind: 'mixed', toolGroups: [...new Set([...dbGroups, 'quality', 'company'])] };
  }
  if (ragMatch) {
    return { kind: 'rag', toolGroups: ['quality'] };
  }
  return { kind: 'db', toolGroups: [...new Set([...dbGroups, 'company'])], fastPath: matchFastPath(message) };
}
