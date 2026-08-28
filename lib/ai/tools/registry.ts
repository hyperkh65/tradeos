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
  searchKnowledgeTool,
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find(t => t.name === name);
}

export function listToolSchemas() {
  return TOOL_REGISTRY.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
}
