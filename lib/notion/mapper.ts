import { getNotionClient, DB, isDemoMode } from './client';
import type { Company, Product, PurchaseOrder, Task, Quote, Inspection, Shipment, Claim, Expense } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────
type Props = Record<string, { type: string; [key: string]: unknown }>;

const getText = (props: Props, key: string): string => {
  const p = props[key];
  if (!p) return '';
  if (p.type === 'title') return (p.title as Array<{ plain_text: string }>).map(t => t.plain_text).join('') ?? '';
  if (p.type === 'rich_text') return (p.rich_text as Array<{ plain_text: string }>).map(t => t.plain_text).join('') ?? '';
  if (p.type === 'email') return (p.email as string) ?? '';
  if (p.type === 'phone_number') return (p.phone_number as string) ?? '';
  if (p.type === 'url') return (p.url as string) ?? '';
  return '';
};

const getSelect = (props: Props, key: string): string => {
  const p = props[key];
  if (!p || p.type !== 'select') return '';
  return (p.select as { name: string } | null)?.name ?? '';
};

const getNum = (props: Props, key: string): number | undefined => {
  const p = props[key];
  if (!p || p.type !== 'number') return undefined;
  return (p.number as number | null) ?? undefined;
};

const getDate = (props: Props, key: string): string | undefined => {
  const p = props[key];
  if (!p || p.type !== 'date') return undefined;
  return (p.date as { start: string } | null)?.start ?? undefined;
};

const getBool = (props: Props, key: string): boolean => {
  const p = props[key];
  if (!p || p.type !== 'checkbox') return false;
  return (p.checkbox as boolean) ?? false;
};

// ─── Notion → Type converters ───────────────────────────────────────────────

export function notionToCompany(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Company {
  const p = page.properties;
  return {
    id: page.id,
    businessId: getText(p, '코드') || page.id.slice(0, 8),
    name: getText(p, '이름'),
    nameEn: getText(p, '영문명') || undefined,
    type: (getSelect(p, '유형') || '기타') as Company['type'],
    country: getText(p, '국가') || getSelect(p, '국가') || '한국',
    email: getText(p, '이메일') || undefined,
    phone: getText(p, '전화번호') || undefined,
    website: getText(p, '웹사이트') || undefined,
    wechat: getText(p, '위챗') || undefined,
    memo: getText(p, '비고') || undefined,
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
}

export function notionToProduct(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Product {
  const p = page.properties;
  return {
    id: page.id,
    businessId: getText(p, '코드') || page.id.slice(0, 8),
    code: getText(p, '제품코드') || getText(p, '코드'),
    nameKo: getText(p, '제품명'),
    nameEn: getText(p, '영문명') || undefined,
    category: getSelect(p, '카테고리') || undefined,
    supplierName: getText(p, '공급업체') || undefined,
    status: (getSelect(p, '상태') || 'active') as Product['status'],
    purchasePrice: getNum(p, '구매단가'),
    sellingPrice: getNum(p, '판매단가'),
    currency: getSelect(p, '통화') || 'USD',
    moq: getNum(p, 'MOQ'),
    leadTimeDays: getNum(p, '리드타임'),
    hsCode: getText(p, 'HS코드') || undefined,
    countryOfOrigin: getSelect(p, '원산지') || undefined,
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
}

export function notionToTask(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Task {
  const p = page.properties;
  return {
    id: page.id,
    title: getText(p, '제목'),
    description: getText(p, '설명') || undefined,
    ownerId: 'user-1',
    ownerName: getText(p, '담당자') || '김대표',
    dueDate: getDate(p, '마감일'),
    priority: (getSelect(p, '우선순위') || 'medium') as Task['priority'],
    status: (getSelect(p, '상태') || '해야 함') as Task['status'],
    relatedName: getText(p, '관련항목') || undefined,
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
}

// ─── Type → Notion properties ────────────────────────────────────────────────

const title = (v: string) => ({ title: [{ text: { content: v } }] });
const rich = (v: string) => ({ rich_text: [{ text: { content: v } }] });
const sel = (v: string) => ({ select: { name: v } });
const num = (v: number | undefined) => ({ number: v ?? null });
const dt = (v: string | undefined) => ({ date: v ? { start: v } : null });

export function companyToNotion(c: Partial<Company> & { name: string }) {
  return {
    '이름': title(c.name),
    ...(c.nameEn ? { '영문명': rich(c.nameEn) } : {}),
    ...(c.businessId ? { '코드': rich(c.businessId) } : {}),
    ...(c.type ? { '유형': sel(c.type) } : {}),
    ...(c.country ? { '국가': rich(c.country) } : {}),
    ...(c.email ? { '이메일': { email: c.email } } : {}),
    ...(c.phone ? { '전화번호': { phone_number: c.phone } } : {}),
    ...(c.wechat ? { '위챗': rich(c.wechat) } : {}),
    ...(c.memo ? { '비고': rich(c.memo) } : {}),
  };
}

export function productToNotion(p: Partial<Product> & { nameKo: string; code: string }) {
  return {
    '제품명': title(p.nameKo),
    ...(p.nameEn ? { '영문명': rich(p.nameEn) } : {}),
    ...(p.code ? { '제품코드': rich(p.code) } : {}),
    ...(p.category ? { '카테고리': sel(p.category) } : {}),
    ...(p.supplierName ? { '공급업체': rich(p.supplierName) } : {}),
    ...(p.status ? { '상태': sel(p.status) } : {}),
    ...(p.purchasePrice !== undefined ? { '구매단가': num(p.purchasePrice) } : {}),
    ...(p.sellingPrice !== undefined ? { '판매단가': num(p.sellingPrice) } : {}),
    ...(p.currency ? { '통화': sel(p.currency) } : {}),
    ...(p.moq !== undefined ? { 'MOQ': num(p.moq) } : {}),
    ...(p.leadTimeDays !== undefined ? { '리드타임': num(p.leadTimeDays) } : {}),
    ...(p.hsCode ? { 'HS코드': rich(p.hsCode) } : {}),
    ...(p.countryOfOrigin ? { '원산지': sel(p.countryOfOrigin) } : {}),
  };
}

export function taskToNotion(t: Partial<Task> & { title: string }) {
  return {
    '제목': title(t.title),
    ...(t.description ? { '설명': rich(t.description) } : {}),
    ...(t.priority ? { '우선순위': sel(t.priority) } : {}),
    ...(t.status ? { '상태': sel(t.status) } : {}),
    ...(t.dueDate ? { '마감일': dt(t.dueDate) } : {}),
    ...(t.ownerName ? { '담당자': rich(t.ownerName) } : {}),
    ...(t.relatedName ? { '관련항목': rich(t.relatedName) } : {}),
  };
}

// ─── Fetch from Notion ───────────────────────────────────────────────────────

async function fetchFromNotion<T>(
  dbId: string,
  mapper: (page: { id: string; properties: Props; created_time: string; last_edited_time: string }) => T
): Promise<T[]> {
  if (!dbId || isDemoMode()) return [];
  try {
    const notion = getNotionClient();
    const res = await notion.databases.query({ database_id: dbId, page_size: 100 });
    return res.results
      .filter(p => p.object === 'page')
      .map(p => mapper(p as Parameters<typeof mapper>[0]));
  } catch (e) {
    console.error('[Notion] fetch error:', e);
    return [];
  }
}

export async function fetchNotionCompanies(): Promise<Company[]> {
  return fetchFromNotion(DB.companies, notionToCompany);
}

export async function fetchNotionProducts(): Promise<Product[]> {
  return fetchFromNotion(DB.products, notionToProduct);
}

export async function fetchNotionTasks(): Promise<Task[]> {
  return fetchFromNotion(DB.tasks, notionToTask);
}

export async function createNotionCompany(c: Partial<Company> & { name: string }): Promise<string | null> {
  if (!DB.companies || isDemoMode()) return null;
  try {
    const notion = getNotionClient();
    const page = await notion.pages.create({
      parent: { database_id: DB.companies },
      properties: companyToNotion(c),
    });
    return page.id;
  } catch (e) {
    console.error('[Notion] create company error:', e);
    return null;
  }
}

export async function createNotionProduct(p: Partial<Product> & { nameKo: string; code: string }): Promise<string | null> {
  if (!DB.products || isDemoMode()) return null;
  try {
    const notion = getNotionClient();
    const page = await notion.pages.create({
      parent: { database_id: DB.products },
      properties: productToNotion(p),
    });
    return page.id;
  } catch (e) {
    console.error('[Notion] create product error:', e);
    return null;
  }
}

export async function createNotionTask(t: Partial<Task> & { title: string }): Promise<string | null> {
  if (!DB.tasks || isDemoMode()) return null;
  try {
    const notion = getNotionClient();
    const page = await notion.pages.create({
      parent: { database_id: DB.tasks },
      properties: taskToNotion(t),
    });
    return page.id;
  } catch (e) {
    console.error('[Notion] create task error:', e);
    return null;
  }
}

export async function updateNotionPage(pageId: string, props: Record<string, unknown>): Promise<void> {
  if (!pageId || isDemoMode()) return;
  try {
    const notion = getNotionClient();
    await notion.pages.update({ page_id: pageId, properties: props as Parameters<typeof notion.pages.update>[0]['properties'] });
  } catch (e) {
    console.error('[Notion] update error:', e);
  }
}

export async function archiveNotionPage(pageId: string): Promise<void> {
  if (!pageId || isDemoMode()) return;
  try {
    const notion = getNotionClient();
    await notion.pages.update({ page_id: pageId, archived: true });
  } catch (e) {
    console.error('[Notion] archive error:', e);
  }
}
