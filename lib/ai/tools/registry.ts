import { getDb } from '@/lib/db/sqlite';
import { searchKnowledge } from '../rag';
import type { ToolDefinition } from './types';

const clampLimit = (n: unknown, def = 15, max = 50) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.min(Math.floor(v), max);
};

/** 이 프로젝트에는 검품/클레임/제품처럼 레코드 단위의 세분화된 권한 모델이 없다
 * (로그인한 사용자는 그룹웨어 내에서 동일 데이터를 조회 가능 — 기존 GET 라우트들과 동일).
 * 그래서 도구의 권한 경계는 "로그인 여부"이고, 이는 orchestrator가 매 요청마다
 * requireAuth()로 이미 강제한다. 이후 특정 도구에 더 세밀한 권한이 필요해지면
 * 이 파일의 해당 handler 안에서만 검사를 추가하면 된다(다른 코드 영향 없음). */

interface BaseArgs { query?: string; dateFrom?: string; dateTo?: string; limit?: number }

/** "이번 달 발주 현황" 같은 질문은 키워드가 없다(query가 비어있어도 되어야 함) —
 * 대신 날짜 컬럼으로 범위를 좁힌다. keywordColumns가 비어있거나 query가 없으면
 * 키워드 조건 자체를 생략한다(전체 대상 + 날짜 필터만). */
function buildWhere(args: BaseArgs, keywordColumns: string[], dateColumn?: string): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (args.query?.trim() && keywordColumns.length) {
    const q = `%${args.query.trim()}%`;
    conditions.push(`(${keywordColumns.map(c => `${c} LIKE ?`).join(' OR ')})`);
    params.push(...keywordColumns.map(() => q));
  }
  if (dateColumn && args.dateFrom) { conditions.push(`${dateColumn} >= ?`); params.push(args.dateFrom); }
  if (dateColumn && args.dateTo) { conditions.push(`${dateColumn} <= ?`); params.push(args.dateTo); }
  return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

const dateParams = (dateColumnLabel: string) => ({
  dateFrom: { type: 'string', description: `${dateColumnLabel} 시작일(YYYY-MM-DD, 생략 가능) — "이번 달"이면 이번 달 1일` },
  dateTo: { type: 'string', description: `${dateColumnLabel} 종료일(YYYY-MM-DD, 생략 가능) — "이번 달"이면 오늘 날짜` },
});

const searchProducts: ToolDefinition<BaseArgs> = {
  name: 'searchProducts',
  description: '제품명/코드/카테고리/공급업체명으로 제품을 검색한다. query를 비워두면 최신순 전체 목록.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['name_ko', 'name_en', 'code', 'category', 'supplier_name']);
    const rows = db.prepare(`SELECT id, business_id, code, name_ko, name_en, category, supplier_name, status, purchase_price, selling_price, currency
      FROM products ${clause} ORDER BY updated_at DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getProduct: ToolDefinition<{ id: string }> = {
  name: 'getProduct',
  description: '제품 id로 상세 정보를 조회한다.',
  parameters: { type: 'object', properties: { id: { type: 'string', description: '제품 id' } }, required: ['id'] },
  handler: async ({ id }) => {
    const db = getDb();
    return db.prepare(`SELECT * FROM products WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  },
};

const searchInspections: ToolDefinition<BaseArgs> = {
  name: 'searchInspections',
  description: '검품번호/제품명/공급업체명/검품결과 요약으로 검품 기록을 검색한다. dateFrom/dateTo로 검품일 범위 지정 가능(예: 이번 달 검품 현황).',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('검품일'), limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'product_name', 'supplier_name', 'summary'], 'inspection_date');
    const rows = db.prepare(`SELECT id, business_id, po_business_id, supplier_name, product_name, inspection_date, inspection_type, result, defect_rate, summary, status
      FROM inspections ${clause} ORDER BY inspection_date DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getInspection: ToolDefinition<{ id: string }> = {
  name: 'getInspection',
  description: '검품 id로 상세 정보를 조회한다.',
  parameters: { type: 'object', properties: { id: { type: 'string', description: '검품 id' } }, required: ['id'] },
  handler: async ({ id }) => {
    const db = getDb();
    return db.prepare(`SELECT * FROM inspections WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  },
};

const searchClaims: ToolDefinition<BaseArgs> = {
  name: 'searchClaims',
  description: '클레임번호/고객사/공급업체/제품명/이슈유형/내용으로 클레임을 검색한다. dateFrom/dateTo로 접수일 범위 지정 가능.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('접수일'), limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'customer_name', 'supplier_name', 'product_name', 'issue_type', 'description'], 'created_at');
    const rows = db.prepare(`SELECT id, business_id, customer_name, supplier_name, product_name, issue_type, description, claim_amount, currency, status, created_at
      FROM claims ${clause} ORDER BY created_at DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getClaim: ToolDefinition<{ id: string }> = {
  name: 'getClaim',
  description: '클레임 id로 상세 정보를 조회한다.',
  parameters: { type: 'object', properties: { id: { type: 'string', description: '클레임 id' } }, required: ['id'] },
  handler: async ({ id }) => {
    const db = getDb();
    return db.prepare(`SELECT * FROM claims WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  },
};

const searchCompanies: ToolDefinition<BaseArgs & { type?: string }> = {
  name: 'searchCompanies',
  description: '거래처(고객사/공급업체/포워더 등)를 이름으로 검색한다. type으로 업체 유형을 좁힐 수 있다.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '검색어(업체명, 생략 가능)' },
      type: { type: 'string', description: '업체 유형(예: 고객사, 공급업체, 포워더) — 생략 가능' },
      limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' },
    },
  },
  handler: async (args) => {
    const db = getDb();
    const { clause: kwClause, params } = buildWhere(args, ['name', 'name_en']);
    let clause = kwClause;
    if (args.type) { clause = clause ? `${clause} AND type=?` : 'WHERE type=?'; params.push(args.type); }
    const rows = db.prepare(`SELECT id, business_id, name, name_en, type, country, email, phone FROM companies ${clause} ORDER BY updated_at DESC LIMIT ?`)
      .all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getCompany: ToolDefinition<{ id: string }> = {
  name: 'getCompany',
  description: '거래처 id로 상세 정보를 조회한다.',
  parameters: { type: 'object', properties: { id: { type: 'string', description: '거래처 id' } }, required: ['id'] },
  handler: async ({ id }) => {
    const db = getDb();
    return db.prepare(`SELECT * FROM companies WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  },
};

const searchPurchaseOrders: ToolDefinition<BaseArgs> = {
  name: 'searchPurchaseOrders',
  description: '발주번호/공급업체명/상태로 발주(PO)를 검색한다. query를 비워두고 dateFrom/dateTo만 넘기면 "이번 달 발주 현황"처럼 기간별 전체 목록을 가져올 수 있다(발주일 기준).',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('발주일'), limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'supplier_name', 'status'], 'order_date');
    const rows = db.prepare(`SELECT id, business_id, supplier_name, total_amount, currency, status, order_date, etd
      FROM purchase_orders ${clause} ORDER BY order_date DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getPurchaseOrder: ToolDefinition<{ id: string }> = {
  name: 'getPurchaseOrder',
  description: '발주(PO) id로 상세 정보를 조회한다(품목 포함).',
  parameters: { type: 'object', properties: { id: { type: 'string', description: '발주 id' } }, required: ['id'] },
  handler: async ({ id }) => {
    const db = getDb();
    return db.prepare(`SELECT * FROM purchase_orders WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  },
};

const getPurchaseOrdersTotal: ToolDefinition<BaseArgs> = {
  name: 'getPurchaseOrdersTotal',
  description: '발주(PO) 금액 합계를 통화별로 정확히 계산한다("총 발주금액", "이번 달 발주 총액" 같은 합계 질문에는 searchPurchaseOrders로 직접 더하지 말고 반드시 이 도구를 써라 — DB가 직접 계산해서 누락/계산오류가 없다).',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('발주일') } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'supplier_name', 'status'], 'order_date');
    const byCurrency = db.prepare(`SELECT currency, SUM(total_amount) as total, COUNT(*) as count FROM purchase_orders ${clause} GROUP BY currency`).all(...params) as Record<string, unknown>[];
    return { byCurrency };
  },
};

const searchShipments: ToolDefinition<BaseArgs> = {
  name: 'searchShipments',
  description: '선적번호/포워더명/출발항/도착항/B/L번호로 선적을 검색한다. dateFrom/dateTo로 출항일(ETD) 범위 지정 가능.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('출항일(ETD)'), limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'forwarder_name', 'pol', 'pod', 'bl_no'], 'etd');
    const rows = db.prepare(`SELECT id, business_id, type, forwarder_name, pol, pod, etd, eta, bl_no, status
      FROM shipments ${clause} ORDER BY etd DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const searchQuotes: ToolDefinition<BaseArgs> = {
  name: 'searchQuotes',
  description: '견적번호/거래처명/상태로 견적서를 검색한다. dateFrom/dateTo로 작성일 범위 지정 가능.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('작성일'), limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'company_name', 'status'], 'created_at');
    const rows = db.prepare(`SELECT id, business_id, type, company_name, currency, incoterm, status, created_at
      FROM quotes ${clause} ORDER BY created_at DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getQuote: ToolDefinition<{ id: string }> = {
  name: 'getQuote',
  description: '견적서 id로 상세 정보를 조회한다(품목 포함).',
  parameters: { type: 'object', properties: { id: { type: 'string', description: '견적서 id' } }, required: ['id'] },
  handler: async ({ id }) => {
    const db = getDb();
    return db.prepare(`SELECT * FROM quotes WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  },
};

const searchSales: ToolDefinition<BaseArgs> = {
  name: 'searchSales',
  description: '매출번호/고객사명/PO번호로 매출(판매) 기록을 검색한다. 금액(net_amount/vat/total_amount) 포함. query를 비워두고 dateFrom/dateTo만 넘기면 "이번 달 매출 현황/총액"처럼 기간별 전체 목록을 가져올 수 있다(매출일 기준) — 합계는 반환된 행들의 total_amount를 직접 더해서 계산하라.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(고객사명 등, 생략 가능)' }, ...dateParams('매출일'), limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'customer', 'po_no'], 'sale_date');
    const rows = db.prepare(`SELECT id, business_id, sale_date, customer, sale_type, salesperson, po_no, net_amount, vat, total_amount, currency
      FROM sales ${clause} ORDER BY sale_date DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getSale: ToolDefinition<{ id: string }> = {
  name: 'getSale',
  description: '매출 id로 상세 정보를 조회한다(품목 포함).',
  parameters: { type: 'object', properties: { id: { type: 'string', description: '매출 id' } }, required: ['id'] },
  handler: async ({ id }) => {
    const db = getDb();
    return db.prepare(`SELECT * FROM sales WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  },
};

const getSalesTotal: ToolDefinition<BaseArgs> = {
  name: 'getSalesTotal',
  description: '매출 합계를 통화별로 정확히 계산한다("총 매출금액", "이번 달 매출 총액", "OOO 매출총금액" 같은 합계 질문에는 searchSales로 직접 더하지 말고 반드시 이 도구를 써라 — DB가 직접 계산해서 누락/계산오류가 없다). query로 특정 고객사만 좁힐 수 있다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '고객사명 등 검색어(생략 가능)' }, ...dateParams('매출일') } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'customer', 'po_no'], 'sale_date');
    const byCurrency = db.prepare(`SELECT currency, SUM(total_amount) as total, COUNT(*) as count FROM sales ${clause} GROUP BY currency`).all(...params) as Record<string, unknown>[];
    return { byCurrency };
  },
};

const searchInventory: ToolDefinition<BaseArgs> = {
  name: 'searchInventory',
  description: '제품명/제품코드/보관위치로 현재 재고 수량을 검색한다. query를 비워두면 전체 재고 목록.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['product_name', 'product_code', 'location']);
    const rows = db.prepare(`SELECT id, product_name, product_code, qty, location, purchase_price, currency, updated_at
      FROM inventory ${clause} ORDER BY updated_at DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const searchImports: ToolDefinition<BaseArgs> = {
  name: 'searchImports',
  description: '수입통관번호/선적번호/관세사명/신고번호로 수입통관 기록을 검색한다(관세/부가세/통관수수료 포함). dateFrom/dateTo로 통관일 범위 지정 가능.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('통관(반출)일'), limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'shipment_business_id', 'broker_name', 'declaration_no'], 'release_date');
    const rows = db.prepare(`SELECT id, business_id, shipment_business_id, broker_name, declaration_no, release_date, hs_code, duty, vat, broker_fee, status
      FROM imports ${clause} ORDER BY release_date DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getImport: ToolDefinition<{ id: string }> = {
  name: 'getImport',
  description: '수입통관 id로 상세 정보를 조회한다.',
  parameters: { type: 'object', properties: { id: { type: 'string', description: '수입통관 id' } }, required: ['id'] },
  handler: async ({ id }) => {
    const db = getDb();
    return db.prepare(`SELECT * FROM imports WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  },
};

const searchExpenses: ToolDefinition<BaseArgs> = {
  name: 'searchExpenses',
  description: '비용 항목(분류/내용/관련업체명)으로 지출 기록을 검색한다. dateFrom/dateTo로 지급일 범위 지정 가능(예: 이번 달 비용 현황).',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('지급일'), limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'category', 'description', 'related_name'], 'paid_date');
    const rows = db.prepare(`SELECT id, business_id, category, description, amount, currency, amount_krw, related_name, paid_date, status
      FROM expenses ${clause} ORDER BY paid_date DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getExpensesTotal: ToolDefinition<BaseArgs> = {
  name: 'getExpensesTotal',
  description: '비용 합계를 정확히 계산한다("총 비용", "이번 달 비용 합계" 같은 질문에는 searchExpenses로 직접 더하지 말고 반드시 이 도구를 써라). 통화별 원금 합계와, 이미 원화환산된 amount_krw를 합산한 전체 원화 총액을 함께 준다(각 행이 자기 거래 시점 환율로 이미 환산돼 있으므로 이 원화 합계는 신뢰할 수 있다).',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('지급일') } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'category', 'description', 'related_name'], 'paid_date');
    const byCurrency = db.prepare(`SELECT currency, SUM(amount) as total, COUNT(*) as count FROM expenses ${clause} GROUP BY currency`).all(...params) as Record<string, unknown>[];
    const krw = db.prepare(`SELECT SUM(amount_krw) as totalKrw, COUNT(*) as count FROM expenses ${clause}`).get(...params) as Record<string, unknown>;
    return { byCurrency, totalKrw: krw.totalKrw ?? 0, totalCount: krw.count ?? 0 };
  },
};

const searchCommissions: ToolDefinition<BaseArgs> = {
  name: 'searchCommissions',
  description: '커미션번호/해외거래처명으로 커미션(수수료) 입금 기록을 검색한다. dateFrom/dateTo로 기간 지정 가능.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(생략 가능)' }, ...dateParams('일자'), limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'foreign_company'], 'date');
    const rows = db.prepare(`SELECT id, business_id, foreign_company, date, amount, currency, amount_krw, status
      FROM commissions ${clause} ORDER BY date DESC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const getCommissionsTotal: ToolDefinition<BaseArgs> = {
  name: 'getCommissionsTotal',
  description: '커미션 합계를 정확히 계산한다("총 커미션 금액", "이번 달 커미션 합계" 같은 질문에는 searchCommissions로 직접 더하지 말고 반드시 이 도구를 써라 — 행 누락이나 계산 실수가 절대 없다). 통화별 원금 합계와, 이미 원화환산된 amount_krw를 합산한 전체 원화 총액을 함께 준다(각 행이 자기 입금 시점 환율로 이미 환산돼 있으므로 이 원화 합계는 신뢰할 수 있다).',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(해외거래처명 등, 생략 가능)' }, ...dateParams('일자') } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['business_id', 'foreign_company'], 'date');
    const byCurrency = db.prepare(`SELECT currency, SUM(amount) as total, COUNT(*) as count FROM commissions ${clause} GROUP BY currency`).all(...params) as Record<string, unknown>[];
    const krw = db.prepare(`SELECT SUM(amount_krw) as totalKrw, COUNT(*) as count FROM commissions ${clause}`).get(...params) as Record<string, unknown>;
    return { byCurrency, totalKrw: krw.totalKrw ?? 0, totalCount: krw.count ?? 0 };
  },
};

const getCommission: ToolDefinition<{ id: string }> = {
  name: 'getCommission',
  description: '커미션 id로 상세 정보를 조회한다.',
  parameters: { type: 'object', properties: { id: { type: 'string', description: '커미션 id' } }, required: ['id'] },
  handler: async ({ id }) => {
    const db = getDb();
    return db.prepare(`SELECT * FROM commissions WHERE id=?`).get(id) as Record<string, unknown> | undefined ?? null;
  },
};

const searchEmployees: ToolDefinition<BaseArgs> = {
  name: 'searchEmployees',
  description: '이름/부서로 사내 직원을 검색한다(비밀번호 등 민감정보는 절대 포함하지 않음). query를 비워두면 전체 직원 목록.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(이름/부서, 생략 가능)' }, limit: { type: 'number', description: '결과 개수(기본 15, 최대 50)' } } },
  handler: async (args) => {
    const db = getDb();
    const { clause, params } = buildWhere(args, ['name', 'department']);
    const rows = db.prepare(`SELECT id, name, email, department, role, status
      FROM users ${clause} ORDER BY name ASC LIMIT ?`).all(...params, clampLimit(args.limit)) as Record<string, unknown>[];
    return rows;
  },
};

const searchKnowledgeTool: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchKnowledge',
  description: '제품/검품/클레임 등 사내 자료를 의미 기반(semantic)으로 검색한다. 키워드가 정확히 일치하지 않아도 관련 내용을 찾을 수 있다. 각 결과는 출처(sourceType/sourceId)를 포함한다. 정확한 금액/수량/기간 집계가 필요하면 이 도구 대신 해당 데이터의 search 도구(searchSales, searchPurchaseOrders 등)를 써라 — 이건 어디까지나 의미 검색이라 숫자 계산에는 부적합하다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '자연어 질문 또는 검색어' }, limit: { type: 'number', description: '결과 개수(기본 8, 최대 20)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    return searchKnowledge(query, { limit: clampLimit(limit, 8, 20) });
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOL_REGISTRY: ToolDefinition<any, any>[] = [
  searchProducts, getProduct,
  searchInspections, getInspection,
  searchClaims, getClaim,
  searchCompanies, getCompany,
  searchPurchaseOrders, getPurchaseOrder, getPurchaseOrdersTotal,
  searchShipments,
  searchQuotes, getQuote,
  searchSales, getSale, getSalesTotal,
  searchInventory,
  searchImports, getImport,
  searchExpenses, getExpensesTotal,
  searchCommissions, getCommission, getCommissionsTotal,
  searchEmployees,
  searchKnowledgeTool,
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find(t => t.name === name);
}

export function listToolSchemas() {
  return TOOL_REGISTRY.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
}
