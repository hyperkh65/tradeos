import { getDb } from '@/lib/db/sqlite';
import { searchKnowledge } from '../rag';
import type { ToolDefinition } from './types';

const clampLimit = (n: unknown, def = 10, max = 30) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.min(Math.floor(v), max);
};

/** 이 프로젝트에는 검품/클레임/제품처럼 레코드 단위의 세분화된 권한 모델이 없다
 * (로그인한 사용자는 그룹웨어 내에서 동일 데이터를 조회 가능 — 기존 GET 라우트들과 동일).
 * 그래서 도구의 권한 경계는 "로그인 여부"이고, 이는 orchestrator가 매 요청마다
 * requireAuth()로 이미 강제한다. 이후 특정 도구에 더 세밀한 권한이 필요해지면
 * 이 파일의 해당 handler 안에서만 검사를 추가하면 된다(다른 코드 영향 없음). */

const searchProducts: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchProducts',
  description: '제품명/코드/카테고리/공급업체명으로 제품을 검색한다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, code, name_ko, name_en, category, supplier_name, status, purchase_price, selling_price, currency
      FROM products WHERE name_ko LIKE ? OR name_en LIKE ? OR code LIKE ? OR category LIKE ? OR supplier_name LIKE ?
      ORDER BY updated_at DESC LIMIT ?`).all(q, q, q, q, q, clampLimit(limit)) as Record<string, unknown>[];
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

const searchInspections: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchInspections',
  description: '검품번호/제품명/공급업체명/검품결과 요약으로 검품 기록을 검색한다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, po_business_id, supplier_name, product_name, inspection_date, inspection_type, result, defect_rate, summary, status
      FROM inspections WHERE business_id LIKE ? OR product_name LIKE ? OR supplier_name LIKE ? OR summary LIKE ?
      ORDER BY created_at DESC LIMIT ?`).all(q, q, q, q, clampLimit(limit)) as Record<string, unknown>[];
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

const searchClaims: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchClaims',
  description: '클레임번호/고객사/공급업체/제품명/이슈유형/내용으로 클레임을 검색한다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, customer_name, supplier_name, product_name, issue_type, description, claim_amount, currency, status
      FROM claims WHERE business_id LIKE ? OR customer_name LIKE ? OR supplier_name LIKE ? OR product_name LIKE ? OR issue_type LIKE ? OR description LIKE ?
      ORDER BY created_at DESC LIMIT ?`).all(q, q, q, q, q, q, clampLimit(limit)) as Record<string, unknown>[];
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

const searchCompanies: ToolDefinition<{ query: string; type?: string; limit?: number }> = {
  name: 'searchCompanies',
  description: '거래처(고객사/공급업체/포워더 등)를 이름으로 검색한다. type으로 업체 유형을 좁힐 수 있다.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '검색어(업체명)' },
      type: { type: 'string', description: '업체 유형(예: 고객사, 공급업체, 포워더) — 생략 가능' },
      limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' },
    },
    required: ['query'],
  },
  handler: async ({ query, type, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = type
      ? db.prepare(`SELECT id, business_id, name, name_en, type, country, email, phone FROM companies WHERE (name LIKE ? OR name_en LIKE ?) AND type=? ORDER BY updated_at DESC LIMIT ?`).all(q, q, type, clampLimit(limit)) as Record<string, unknown>[]
      : db.prepare(`SELECT id, business_id, name, name_en, type, country, email, phone FROM companies WHERE name LIKE ? OR name_en LIKE ? ORDER BY updated_at DESC LIMIT ?`).all(q, q, clampLimit(limit)) as Record<string, unknown>[];
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

const searchPurchaseOrders: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchPurchaseOrders',
  description: '발주번호/공급업체명/상태로 발주(PO)를 검색한다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, supplier_name, total_amount, currency, status, order_date, etd
      FROM purchase_orders WHERE business_id LIKE ? OR supplier_name LIKE ? OR status LIKE ?
      ORDER BY order_date DESC LIMIT ?`).all(q, q, q, clampLimit(limit)) as Record<string, unknown>[];
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

const searchShipments: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchShipments',
  description: '선적번호/포워더명/출발항/도착항/B/L번호로 선적을 검색한다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, type, forwarder_name, pol, pod, etd, eta, bl_no, status
      FROM shipments WHERE business_id LIKE ? OR forwarder_name LIKE ? OR pol LIKE ? OR pod LIKE ? OR bl_no LIKE ?
      ORDER BY updated_at DESC LIMIT ?`).all(q, q, q, q, q, clampLimit(limit)) as Record<string, unknown>[];
    return rows;
  },
};

const searchQuotes: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchQuotes',
  description: '견적번호/거래처명/상태로 견적서를 검색한다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, type, company_name, currency, incoterm, status, created_at
      FROM quotes WHERE business_id LIKE ? OR company_name LIKE ? OR status LIKE ?
      ORDER BY created_at DESC LIMIT ?`).all(q, q, q, clampLimit(limit)) as Record<string, unknown>[];
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

const searchSales: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchSales',
  description: '매출번호/고객사명/PO번호로 매출(판매) 기록을 검색한다. 금액(net_amount/vat/total_amount)이 포함된다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(고객사명 등)' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, sale_date, customer, sale_type, salesperson, po_no, net_amount, vat, total_amount, currency
      FROM sales WHERE business_id LIKE ? OR customer LIKE ? OR po_no LIKE ?
      ORDER BY sale_date DESC LIMIT ?`).all(q, q, q, clampLimit(limit)) as Record<string, unknown>[];
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

const searchInventory: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchInventory',
  description: '제품명/제품코드/보관위치로 현재 재고 수량을 검색한다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, product_name, product_code, qty, location, purchase_price, currency, updated_at
      FROM inventory WHERE product_name LIKE ? OR product_code LIKE ? OR location LIKE ?
      ORDER BY updated_at DESC LIMIT ?`).all(q, q, q, clampLimit(limit)) as Record<string, unknown>[];
    return rows;
  },
};

const searchImports: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchImports',
  description: '수입통관번호/선적번호/관세사명/신고번호로 수입통관 기록을 검색한다(관세/부가세/통관수수료 포함).',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, shipment_business_id, broker_name, declaration_no, release_date, hs_code, duty, vat, broker_fee, status
      FROM imports WHERE business_id LIKE ? OR shipment_business_id LIKE ? OR broker_name LIKE ? OR declaration_no LIKE ?
      ORDER BY created_at DESC LIMIT ?`).all(q, q, q, q, clampLimit(limit)) as Record<string, unknown>[];
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

const searchExpenses: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchExpenses',
  description: '비용 항목(분류/내용/관련업체명)으로 지출 기록을 검색한다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, category, description, amount, currency, amount_krw, related_name, paid_date, status
      FROM expenses WHERE business_id LIKE ? OR category LIKE ? OR description LIKE ? OR related_name LIKE ?
      ORDER BY created_at DESC LIMIT ?`).all(q, q, q, q, clampLimit(limit)) as Record<string, unknown>[];
    return rows;
  },
};

const searchCommissions: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchCommissions',
  description: '커미션번호/해외거래처명으로 커미션(수수료) 입금 기록을 검색한다.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, business_id, foreign_company, date, amount, currency, amount_krw, status
      FROM commissions WHERE business_id LIKE ? OR foreign_company LIKE ?
      ORDER BY date DESC LIMIT ?`).all(q, q, clampLimit(limit)) as Record<string, unknown>[];
    return rows;
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

const searchEmployees: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchEmployees',
  description: '이름/부서/직급으로 사내 직원을 검색한다(비밀번호 등 민감정보는 절대 포함하지 않음).',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '검색어(이름/부서)' }, limit: { type: 'number', description: '결과 개수(기본 10, 최대 30)' } }, required: ['query'] },
  handler: async ({ query, limit }) => {
    const db = getDb();
    const q = `%${query}%`;
    const rows = db.prepare(`SELECT id, name, email, department, role, status
      FROM users WHERE name LIKE ? OR department LIKE ?
      ORDER BY name ASC LIMIT ?`).all(q, q, clampLimit(limit)) as Record<string, unknown>[];
    return rows;
  },
};

const searchKnowledgeTool: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'searchKnowledge',
  description: '제품/검품/클레임 등 사내 자료를 의미 기반(semantic)으로 검색한다. 키워드가 정확히 일치하지 않아도 관련 내용을 찾을 수 있다. 각 결과는 출처(sourceType/sourceId)를 포함한다.',
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
  searchPurchaseOrders, getPurchaseOrder,
  searchShipments,
  searchQuotes, getQuote,
  searchSales, getSale,
  searchInventory,
  searchImports, getImport,
  searchExpenses,
  searchCommissions, getCommission,
  searchEmployees,
  searchKnowledgeTool,
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find(t => t.name === name);
}

export function listToolSchemas() {
  return TOOL_REGISTRY.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
}
