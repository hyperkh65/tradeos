import { getNotionClient, DB, isDemoMode } from './client';
import type { Company, Product, PurchaseOrder, Task, Quote, Shipment, Import, Expense } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────
type Props = Record<string, { type: string; [key: string]: unknown }>;

const getText = (props: Props, ...keys: string[]): string => {
  for (const key of keys) {
    const p = props[key];
    if (!p) continue;
    if (p.type === 'title') {
      const v = (p.title as Array<{ plain_text: string }>).map(t => t.plain_text).join('');
      if (v) return v;
    }
    if (p.type === 'rich_text') {
      const v = (p.rich_text as Array<{ plain_text: string }>).map(t => t.plain_text).join('');
      if (v) return v;
    }
    if (p.type === 'email') { const v = p.email as string; if (v) return v; }
    if (p.type === 'phone_number') { const v = p.phone_number as string; if (v) return v; }
    if (p.type === 'url') { const v = p.url as string; if (v) return v; }
  }
  return '';
};

const getSelect = (props: Props, ...keys: string[]): string => {
  for (const key of keys) {
    const p = props[key];
    if (!p || p.type !== 'select') continue;
    const v = (p.select as { name: string } | null)?.name;
    if (v) return v;
  }
  return '';
};

const getNum = (props: Props, ...keys: string[]): number | undefined => {
  for (const key of keys) {
    const p = props[key];
    if (!p || p.type !== 'number') continue;
    const v = p.number as number | null;
    if (v != null) return v;
  }
  return undefined;
};

const getDate = (props: Props, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const p = props[key];
    if (!p || p.type !== 'date') continue;
    const v = (p.date as { start: string } | null)?.start;
    if (v) return v;
  }
  return undefined;
};

const getBool = (props: Props, key: string): boolean => {
  const p = props[key];
  if (!p || p.type !== 'checkbox') return false;
  return (p.checkbox as boolean) ?? false;
};

// ─── Notion → Type converters ───────────────────────────────────────────────
// Tries ERP (English) field names first, then Korean fallbacks

export function notionToCompany(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Company {
  const p = page.properties;
  const name = getText(p, 'ClientName', '이름');
  // Korean name → 고객사(한국), English name → 공급업체(중국)
  const isKorean = /[가-힣]/.test(name);
  return {
    id: page.id,
    businessId: getText(p, 'BusinessNo', '코드') || page.id,
    name,
    nameEn: getText(p, '영문명') || undefined,
    type: (isKorean ? '고객사' : '공급업체') as Company['type'],
    country: isKorean ? '한국' : '중국',
    email: getText(p, 'Email', '이메일') || undefined,
    phone: getText(p, 'Tel', '전화번호') || undefined,
    website: getText(p, 'Website', '웹사이트') || undefined,
    wechat: getText(p, '위챗') || undefined,
    memo: getText(p, '비고') || undefined,
    ceo: getText(p, 'CEO') || undefined,
    businessNo: getText(p, 'BusinessNo') || undefined,
    address: getText(p, 'Address') || undefined,
    bank: getText(p, 'Bank') || undefined,
    accountNo: getText(p, 'AccountNo', 'AccountHolder') || undefined,
    currency: getText(p, 'Currency') || getSelect(p, 'Currency') || undefined,
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
}

function getFileUrl(p: Props, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const f = (p[k] as any);
    if (!f) continue;
    const url = f.files?.[0]?.external?.url || f.files?.[0]?.file?.url;
    if (url) return url;
  }
  return undefined;
}

function getAllFileUrls(p: Props, ...keys: string[]): string[] {
  const urls: string[] = [];
  for (const k of keys) {
    const f = (p[k] as any);
    if (!f?.files) continue;
    for (const file of f.files as any[]) {
      const url = file.external?.url || file.file?.url;
      if (url) urls.push(url);
    }
  }
  return urls;
}

export function notionToProduct(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Product {
  const p = page.properties;
  const codeFromNotion = getText(p, 'ProductCode', '제품코드', '코드');
  const allImages = getAllFileUrls(p, 'Image', '이미지', 'FileSpec', 'FileEMI', 'FileEfficiency', 'FileKSKC', 'FileEtc');
  const base: Product = {
    id: page.id,
    businessId: page.id,  // Always use Notion page ID — product codes can be duplicate
    code: codeFromNotion || `ERP-${page.id.slice(0, 10)}`,
    nameKo: getText(p, 'ProductName', '제품명', 'Name', '이름'),
    nameEn: getText(p, '영문명') || undefined,
    category: (() => {
      const name = getText(p, 'ProductName', '제품명', 'Name', '이름');
      const cat = getText(p, 'ProductCategory') || getSelect(p, '카테고리') || '';
      return (cat && cat !== name) ? cat : undefined;
    })(),
    supplierName: getText(p, 'Supplier', '공급업체') || undefined,
    status: 'active' as Product['status'],
    purchasePrice: getNum(p, 'Cost', '구매단가'),
    sellingPrice: getNum(p, '판매단가'),
    currency: getText(p, 'Currency') || getSelect(p, '통화') || 'USD',
    moq: getNum(p, 'MOQ'),
    leadTimeDays: getNum(p, '리드타임'),
    hsCode: getText(p, 'HS코드') || undefined,
    countryOfOrigin: getSelect(p, '원산지') || undefined,
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
  return Object.assign(base, {
    imageUrl: allImages[0] || undefined,
    imagesJson: allImages.length > 0 ? JSON.stringify(allImages) : undefined,
    detail: getText(p, 'Detail', '상세') || undefined,
    maker: getText(p, 'Maker', '제조사') || undefined,
    voltage: getText(p, 'Voltage', '전압') || undefined,
    watts: getText(p, 'Watts', '와트') || undefined,
    cct: getText(p, 'CCT') || undefined,
    inputA: getText(p, 'InputA') || undefined,
    outputV: getText(p, 'OutputV') || undefined,
    outputA: getText(p, 'OutputA') || undefined,
    material: getText(p, 'Material', '재질') || undefined,
    sizeSpec: getText(p, 'Size', '사이즈') || undefined,
    converter: getText(p, 'Converter') || undefined,
  });
}

export function notionToTask(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Task {
  const p = page.properties;
  return {
    id: page.id,
    title: getText(p, '제목', 'Title', 'Name', '이름'),
    description: getText(p, '설명', 'Description') || undefined,
    ownerId: 'user-1',
    ownerName: getText(p, '담당자', 'Assignee', 'Owner') || '김대표',
    dueDate: getDate(p, '마감일', 'DueDate', 'Due', 'Date'),
    priority: (getSelect(p, '우선순위', 'Priority') || 'medium') as Task['priority'],
    status: (getSelect(p, '상태', 'Status') || '해야 함') as Task['status'],
    relatedName: getText(p, '관련항목', 'Related') || undefined,
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
}

// ─── ERP PO row → grouped PurchaseOrder ─────────────────────────────────────
// ERP stores one Notion page per line item. Group by PoNo to get PurchaseOrder.

interface ERPPORow {
  pageId: string;
  poNo: string;
  date: string;
  supplier: string;
  currency: string;
  incoterm: string;
  remark: string;
  product: string;
  description: string;
  unit: string;
  unitPrice: number;
  qty: number;
  amount: number;
  remarks: string;
  createdAt: string;
}

function notionToERPPORow(page: { id: string; properties: Props; created_time: string }): ERPPORow {
  const p = page.properties;
  const qty = getNum(p, 'Qty') ?? 0;
  const unitPrice = getNum(p, 'UnitPrice') ?? 0;
  return {
    pageId: page.id,
    poNo: getText(p, 'PoNo', 'PoNo1'),
    date: getDate(p, 'Date') ?? page.created_time.slice(0, 10),
    supplier: getText(p, 'Supplier'),
    currency: getText(p, 'Currency') || getSelect(p, 'Currency', 'Unit') || 'USD',
    incoterm: getText(p, 'GeneralInfo', 'generalInfo'),
    remark: getText(p, 'SpecialNotes', 'specialNotes'),
    product: getText(p, 'Product'),
    description: getText(p, 'Description'),
    unit: getSelect(p, 'Unit') || getText(p, 'Unit') || 'PCS',
    unitPrice,
    qty,
    amount: getNum(p, 'Amount') ?? (qty * unitPrice),
    remarks: getText(p, 'Remarks'),
    createdAt: page.created_time,
  };
}

function groupERPPORows(rows: ERPPORow[]): PurchaseOrder[] {
  const grouped: Record<string, { meta: ERPPORow; items: ERPPORow[] }> = {};
  for (const row of rows) {
    const key = row.poNo || row.pageId;
    if (!grouped[key]) grouped[key] = { meta: row, items: [] };
    if (row.product) grouped[key].items.push(row);
  }
  return Object.values(grouped).map(({ meta, items }) => ({
    id: meta.pageId,
    businessId: meta.poNo || meta.pageId,
    supplierId: '',
    supplierName: meta.supplier,
    items: items.map((it, i) => ({
      id: it.pageId,
      productId: '',
      productCode: '',
      productName: it.product,
      specification: [it.description, it.unit, it.remarks].filter(Boolean).join(' | ') || undefined,
      qty: it.qty,
      unitPrice: it.unitPrice,
      amount: it.amount,
    })),
    currency: meta.currency,
    totalAmount: items.reduce((s, it) => s + it.amount, 0),
    orderDate: meta.date,
    status: 'confirmed' as PurchaseOrder['status'],
    incoterm: meta.incoterm || undefined,
    remark: meta.remark || undefined,
    createdBy: 'ynk-erp',
    createdAt: meta.createdAt,
    updatedAt: meta.createdAt,
  }));
}

// ─── ERP Quote row → grouped Quote ──────────────────────────────────────────

interface ERPQuoteRow {
  pageId: string;
  estimateNo: string;
  date: string;
  client: string;
  currency: string;
  generalInfo: string;
  specialNotes: string;
  product: string;
  description: string;
  unit: string;
  unitPrice: number;
  qty: number;
  amount: number;
  remarks: string;
  createdAt: string;
}

function notionToERPQuoteRow(page: { id: string; properties: Props; created_time: string }): ERPQuoteRow {
  const p = page.properties;
  const qty = getNum(p, 'Qty') ?? 0;
  const unitPrice = getNum(p, 'UnitPrice') ?? 0;
  return {
    pageId: page.id,
    estimateNo: getText(p, 'EstimateNo1', 'EstimateNo'),
    date: getDate(p, 'Date') ?? page.created_time.slice(0, 10),
    client: getText(p, 'Client'),
    currency: getText(p, 'Currency') || 'KRW',
    generalInfo: getText(p, 'GeneralInfo', 'generalInfo'),
    specialNotes: getText(p, 'SpecialNotes', 'specialNotes'),
    product: getText(p, 'Product'),
    description: getText(p, 'Description'),
    unit: getSelect(p, 'Unit') || getText(p, 'Unit') || 'PCS',
    unitPrice,
    qty,
    amount: getNum(p, 'Amount') ?? (qty * unitPrice),
    remarks: getText(p, 'Remarks'),
    createdAt: page.created_time,
  };
}

function groupERPQuoteRows(rows: ERPQuoteRow[]): Quote[] {
  const grouped: Record<string, { meta: ERPQuoteRow; items: ERPQuoteRow[] }> = {};
  for (const row of rows) {
    const key = row.estimateNo || row.pageId;
    if (!grouped[key]) grouped[key] = { meta: row, items: [] };
    if (row.product) grouped[key].items.push(row);
  }
  return Object.values(grouped).map(({ meta, items }) => ({
    id: meta.pageId,
    businessId: meta.estimateNo || meta.pageId,
    type: 'customer' as Quote['type'],
    companyId: '',
    companyName: meta.client,
    items: items.map(it => ({
      productId: '',
      productName: it.product,
      quantity: it.qty,
      unitPrice: it.unitPrice,
    })),
    currency: meta.currency,
    incoterm: meta.generalInfo || undefined,
    paymentTerms: undefined,
    validity: undefined,
    status: 'sent' as Quote['status'],
    remark: meta.specialNotes || undefined,
    createdBy: 'ynk-erp',
    createdAt: meta.createdAt,
  }));
}

// ─── Type → Notion properties ────────────────────────────────────────────────
// Writes to ERP field names (since DBs point to ERP Notion)

const titleProp = (v: string) => ({ title: [{ text: { content: v } }] });
const rich = (v: string) => ({ rich_text: [{ text: { content: v || '' } }] });
const sel = (v: string) => ({ select: { name: v } });
const num = (v: number | undefined) => ({ number: v ?? null });
const dt = (v: string | undefined) => ({ date: v ? { start: v } : null });

export function companyToNotion(c: Partial<Company> & { name: string }) {
  return {
    'ClientName': titleProp(c.name),
    ...(c.businessNo ? { 'BusinessNo': rich(c.businessNo) } : {}),
    ...(c.phone ? { 'Tel': rich(c.phone) } : {}),
    ...(c.email ? { 'Email': { email: c.email } } : {}),
    ...(c.address ? { 'Address': rich(c.address) } : {}),
    ...(c.ceo ? { 'CEO': rich(c.ceo) } : {}),
    ...(c.bank ? { 'Bank': rich(c.bank) } : {}),
    ...(c.accountNo ? { 'AccountNo': rich(c.accountNo) } : {}),
    ...(c.currency ? { 'Currency': sel(c.currency) } : {}),
    ...(c.memo ? { '비고': rich(c.memo) } : {}),
  };
}

// Notion Products DB fields: 이름(title), ProductCode, ProductName, ProductCategory,
// Supplier, Cost(number), Currency(rich_text), Detail, Maker, Material, Size,
// InputA, OutputV, OutputA, Converter, Image, FileSpec, FileEMI, FileEfficiency, FileKSKC, FileEtc
export function productToNotion(p: Partial<Product> & { nameKo: string; code: string } & Record<string, any>) {
  return {
    '이름': titleProp(p.code || p.nameKo),
    'ProductCode': rich(p.code),
    'ProductName': rich(p.nameKo),
    ...(p.category ? { 'ProductCategory': rich(p.category) } : {}),
    ...(p.supplierName ? { 'Supplier': rich(p.supplierName) } : {}),
    ...(p.purchasePrice !== undefined ? { 'Cost': num(p.purchasePrice) } : {}),
    ...(p.currency ? { 'Currency': rich(p.currency) } : {}),
    ...(p.detail ? { 'Detail': rich(p.detail) } : {}),
    ...(p.maker ? { 'Maker': rich(p.maker) } : {}),
    ...(p.inputA ? { 'InputA': rich(p.inputA) } : {}),
    ...(p.outputV ? { 'OutputV': rich(p.outputV) } : {}),
    ...(p.outputA ? { 'OutputA': rich(p.outputA) } : {}),
    ...(p.material ? { 'Material': rich(p.material) } : {}),
    ...(p.sizeSpec ? { 'Size': rich(p.sizeSpec) } : {}),
    ...(p.converter ? { 'Converter': rich(p.converter) } : {}),
  };
}

export function taskToNotion(t: Partial<Task> & { title: string }) {
  return {
    '제목': titleProp(t.title),
    ...(t.description ? { '설명': rich(t.description) } : {}),
    ...(t.priority ? { '우선순위': sel(t.priority) } : {}),
    ...(t.status ? { '상태': sel(t.status) } : {}),
    ...(t.dueDate ? { '마감일': dt(t.dueDate) } : {}),
    ...(t.ownerName ? { '담당자': rich(t.ownerName) } : {}),
    ...(t.relatedName ? { '관련항목': rich(t.relatedName) } : {}),
  };
}

// ─── ERP Shipment / Import (DB_IMPORTS_MASTER) ──────────────────────────────
// Each Notion page is one import shipment with both transport and customs data.

function notionToShipment(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Shipment {
  const p = page.properties;
  const importNo = getText(p, 'ImportNo');
  const transportType = getText(p, 'TransportType').toUpperCase();
  let type: Shipment['type'] = 'LCL';
  if (transportType.includes('FCL')) type = 'FCL';
  else if (transportType.includes('AIR') || transportType.includes('항공')) type = 'AIR';
  else if (transportType.includes('COURIER') || transportType.includes('특송')) type = 'COURIER';

  const vesselVoyage = getText(p, 'VesselVoyage');
  const parts = vesselVoyage.split('/').map(s => s.trim());

  const clearanceDate = getDate(p, 'ClearanceDate');
  let status: Shipment['status'] = 'booked';
  if (clearanceDate) status = 'completed';
  else if (getText(p, 'BLNoMaster') || getText(p, 'BLNoHouse')) status = 'in_transit';

  return {
    id: page.id,
    businessId: importNo || page.id.slice(0, 8),
    type,
    forwarderName: getText(p, 'Forwarder') || undefined,
    origin: getText(p, 'Exporter') || undefined,
    pol: getText(p, 'POL') || undefined,
    pod: getText(p, 'POD') || undefined,
    vessel: parts[0] || vesselVoyage || undefined,
    voyage: parts[1] || undefined,
    blNo: getText(p, 'BLNoMaster') || getText(p, 'BLNoHouse') || undefined,
    containerType: getText(p, 'ContainerType') || undefined,
    documents: [],
    cargoItems: [],
    poIds: [],
    status,
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
}

function notionToImport(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Import {
  const p = page.properties;
  const importNo = getText(p, 'ImportNo');
  const clearanceDate = getDate(p, 'ClearanceDate');

  return {
    id: page.id + '_imp',
    businessId: importNo ? `IMP-${importNo}` : `IMP-${page.id.slice(0, 8)}`,
    shipmentId: page.id,
    shipmentBusinessId: importNo || page.id.slice(0, 8),
    brokerName: getText(p, 'Importer') || undefined,
    releaseDate: clearanceDate || undefined,
    duty: getNum(p, 'DutyAmount') || undefined,
    vat: getNum(p, 'VATAmount') || undefined,
    ftaApplicable: false,
    status: clearanceDate ? 'completed' : 'in_progress',
    createdAt: page.created_time,
  };
}

// ─── ERP Expense (DB_INVOICES) ───────────────────────────────────────────────

function notionToExpense(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Expense {
  const p = page.properties;
  const invoiceNo = getText(p, 'InvoiceNo');
  const issueDate = getDate(p, 'IssueDate') || getDate(p, 'Date') || page.created_time.slice(0, 10);

  return {
    id: page.id,
    businessId: invoiceNo || page.id.slice(0, 8),
    category: getText(p, 'BillingReason') || '매출',
    description: getText(p, 'Description') || getText(p, 'Client') || '',
    amount: getNum(p, 'Amount') || 0,
    currency: 'KRW',
    relatedName: getText(p, 'Client') || undefined,
    invoiceNo: invoiceNo || undefined,
    paidDate: issueDate,
    status: 'paid' as Expense['status'],
    createdBy: 'ynk-erp',
    createdAt: page.created_time,
  };
}

// ─── ERP Task (DB_SCHEDULE) ──────────────────────────────────────────────────

function notionToERPTask(page: { id: string; properties: Props; created_time: string; last_edited_time: string }): Task {
  const p = page.properties;
  return {
    id: page.id,
    title: getText(p, 'Title', '이름', 'Name', '제목'),
    description: getText(p, 'Description', '설명') || undefined,
    ownerId: 'user-1',
    ownerName: getText(p, 'Assignee', '담당자') || '김대표',
    dueDate: getDate(p, 'DueDate', 'Date', '마감일'),
    priority: (getSelect(p, '우선순위') || 'medium') as Task['priority'],
    status: (getSelect(p, 'Status', '상태') || '해야 함') as Task['status'],
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
}

// ─── Fetch from Notion ───────────────────────────────────────────────────────

async function fetchAllPages(dbId: string): Promise<Array<{ id: string; properties: Props; created_time: string; last_edited_time: string }>> {
  if (!dbId || isDemoMode()) return [];
  const notion = getNotionClient();
  const results: Array<{ id: string; properties: Props; created_time: string; last_edited_time: string }> = [];
  let cursor: string | undefined;
  try {
    do {
      const res = await notion.databases.query({
        database_id: dbId,
        page_size: 100,
        start_cursor: cursor,
      });
      results.push(...res.results.filter(p => p.object === 'page') as unknown as typeof results);
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);
  } catch (e) {
    console.error('[Notion] fetchAllPages error:', e);
  }
  return results;
}

async function fetchFromNotion<T>(
  dbId: string,
  mapper: (page: { id: string; properties: Props; created_time: string; last_edited_time: string }) => T
): Promise<T[]> {
  const pages = await fetchAllPages(dbId);
  return pages.map(mapper);
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

export async function fetchNotionShipments(): Promise<Shipment[]> {
  return fetchFromNotion(DB.shipments, notionToShipment);
}

export async function fetchNotionImports(): Promise<Import[]> {
  return fetchFromNotion(DB.imports, notionToImport);
}

export async function fetchNotionExpenses(): Promise<Expense[]> {
  return fetchFromNotion(DB.expenses, notionToExpense);
}

export async function fetchNotionERPTasks(): Promise<Task[]> {
  if (!DB.tasks || isDemoMode()) return [];
  return fetchFromNotion(DB.tasks, notionToERPTask);
}

export async function fetchNotionPurchaseOrders(): Promise<PurchaseOrder[]> {
  if (!DB.purchaseOrders || isDemoMode()) return [];
  try {
    const pages = await fetchAllPages(DB.purchaseOrders);
    const rows = pages.map(p => notionToERPPORow(p as { id: string; properties: Props; created_time: string }));
    return groupERPPORows(rows);
  } catch (e) {
    console.error('[Notion] fetchNotionPurchaseOrders error:', e);
    return [];
  }
}

export async function fetchNotionQuotes(): Promise<Quote[]> {
  if (!DB.quotes || isDemoMode()) return [];
  try {
    const pages = await fetchAllPages(DB.quotes);
    const rows = pages.map(p => notionToERPQuoteRow(p as { id: string; properties: Props; created_time: string }));
    return groupERPQuoteRows(rows);
  } catch (e) {
    console.error('[Notion] fetchNotionQuotes error:', e);
    return [];
  }
}

// ─── Create in Notion ────────────────────────────────────────────────────────

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

export async function createNotionShipment(s: Shipment): Promise<string | null> {
  if (!DB.shipments || isDemoMode()) return null;
  try {
    const notion = getNotionClient();
    const page = await notion.pages.create({
      parent: { database_id: DB.shipments },
      properties: {
        'ImportNo': rich(s.businessId),
        'Forwarder': rich(s.forwarderName || ''),
        'TransportType': rich(s.type),
        'POL': rich(s.pol || ''),
        'POD': rich(s.pod || ''),
        'VesselVoyage': rich([s.vessel, s.voyage].filter(Boolean).join(' / ')),
        'BLNoMaster': rich(s.blNo || ''),
        'ContainerType': rich(s.containerType || ''),
        'Exporter': rich(s.origin || ''),
      },
    });
    return page.id;
  } catch (e) {
    console.error('[Notion] create shipment error:', e);
    return null;
  }
}

export async function createNotionExpense(e: Expense): Promise<string | null> {
  if (!DB.expenses || isDemoMode()) return null;
  try {
    const notion = getNotionClient();
    const page = await notion.pages.create({
      parent: { database_id: DB.expenses },
      properties: {
        '이름': titleProp(e.invoiceNo || e.businessId),
        'InvoiceNo': rich(e.invoiceNo || e.businessId),
        'Client': rich(e.relatedName || ''),
        'Amount': num(e.amount),
        'BillingReason': rich(e.category),
        'Description': rich(e.description),
        ...(e.paidDate ? { 'IssueDate': dt(e.paidDate) } : {}),
      },
    });
    return page.id;
  } catch (e2) {
    console.error('[Notion] create expense error:', e2);
    return null;
  }
}

// Create PO in Notion: one page per line item (ERP-compatible format)
export async function createNotionPurchaseOrder(po: PurchaseOrder): Promise<string | null> {
  if (!DB.purchaseOrders || isDemoMode()) return null;
  const notion = getNotionClient();
  let firstPageId: string | null = null;
  try {
    const itemsToCreate = po.items.length > 0 ? po.items : [{ productId: '', productCode: '', productName: '', qty: 0, unitPrice: 0, amount: 0 }];
    for (let i = 0; i < itemsToCreate.length; i++) {
      const item = itemsToCreate[i];
      const page = await notion.pages.create({
        parent: { database_id: DB.purchaseOrders },
        properties: {
          'Estimate No': titleProp(po.supplierName),
          'PoNo': rich(po.businessId),
          'index': rich(String(i + 1)),
          'Date': dt(po.orderDate),
          'Supplier': rich(po.supplierName),
          'Currency': rich(po.currency),
          'Product': rich(item.productName || ''),
          'Description': rich((item as { specification?: string }).specification || ''),
          'Unit': sel('PCS'),
          'UnitPrice': num(item.unitPrice),
          'Qty': num(item.qty),
          'Amount': num(item.amount),
          'Remarks': rich(''),
          'GeneralInfo': rich(po.incoterm || ''),
          'SpecialNotes': rich(po.remark || ''),
        },
      });
      if (i === 0) firstPageId = page.id;
    }
    return firstPageId;
  } catch (e) {
    console.error('[Notion] create PO error:', e);
    return null;
  }
}

// Create Quote in Notion: one page per line item (ERP-compatible format)
export async function createNotionQuote(q: Quote): Promise<string | null> {
  if (!DB.quotes || isDemoMode()) return null;
  const notion = getNotionClient();
  let firstPageId: string | null = null;
  try {
    const itemsToCreate = q.items.length > 0 ? q.items : [{ productId: '', productName: '', quantity: 0, unitPrice: 0 }];
    for (let i = 0; i < itemsToCreate.length; i++) {
      const item = itemsToCreate[i];
      const qty = item.quantity ?? (item as any).qty ?? 0;
      const amount = item.amount ?? qty * (item.unitPrice ?? 0);
      const page = await notion.pages.create({
        parent: { database_id: DB.quotes },
        properties: {
          'EstimateNo1': titleProp(q.businessId),
          'EstimateNo': rich(q.businessId),
          'index': rich(String(i + 1)),
          'Date': dt(q.quoteDate || q.createdAt?.slice(0, 10)),
          'Client': rich(q.companyName),
          'Currency': rich(q.currency),
          'Product': rich(item.productName || ''),
          'Description': rich(item.specification || ''),
          'Unit': sel(item.unit || 'PCS'),
          'UnitPrice': num(item.unitPrice),
          'Qty': num(qty),
          'Amount': num(amount),
          'Remarks': rich(item.remark || ''),
          'GeneralInfo': rich(q.generalInfo || q.incoterm || ''),
          'SpecialNotes': rich(q.specialNotes || q.remark || ''),
        },
      });
      if (i === 0) firstPageId = page.id;
    }
    return firstPageId;
  } catch (e) {
    console.error('[Notion] create Quote error:', e);
    return null;
  }
}

// ─── Update / Delete in Notion ───────────────────────────────────────────────

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

// Delete all Notion pages for a PO (by PoNo)
export async function deleteNotionPurchaseOrder(poNo: string): Promise<void> {
  if (!DB.purchaseOrders || isDemoMode() || !poNo) return;
  try {
    const notion = getNotionClient();
    const res = await notion.databases.query({
      database_id: DB.purchaseOrders,
      filter: { property: 'PoNo', rich_text: { equals: poNo } },
    });
    await Promise.all(
      res.results.map(p => notion.pages.update({ page_id: p.id, archived: true }))
    );
  } catch (e) {
    console.error('[Notion] delete PO error:', e);
  }
}

// Delete all Notion pages for a Quote (by EstimateNo)
export async function deleteNotionQuote(estimateNo: string): Promise<void> {
  if (!DB.quotes || isDemoMode() || !estimateNo) return;
  try {
    const notion = getNotionClient();
    const res = await notion.databases.query({
      database_id: DB.quotes,
      filter: { property: 'EstimateNo', rich_text: { equals: estimateNo } },
    });
    await Promise.all(
      res.results.map(p => notion.pages.update({ page_id: p.id, archived: true }))
    );
  } catch (e) {
    console.error('[Notion] delete Quote error:', e);
  }
}

// Update PO: delete existing items then recreate
export async function updateNotionPurchaseOrder(poNo: string, po: PurchaseOrder): Promise<void> {
  await deleteNotionPurchaseOrder(poNo);
  await createNotionPurchaseOrder(po);
}

// Update Quote: delete existing items then recreate
export async function updateNotionQuote(estimateNo: string, q: Quote): Promise<void> {
  await deleteNotionQuote(estimateNo);
  await createNotionQuote(q);
}
