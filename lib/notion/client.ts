import { Client } from '@notionhq/client';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

let _client: Client | null = null;

export function getNotionClient(): Client {
  if (!_client) {
    _client = new Client({ auth: process.env.NOTION_TOKEN ?? '' });
  }
  return _client;
}

export const DB = {
  employees:      process.env.NOTION_DB_EMPLOYEES ?? '',
  departments:    process.env.NOTION_DB_DEPARTMENTS ?? '',
  companies:      process.env.NOTION_DB_COMPANIES ?? '',
  contacts:       process.env.NOTION_DB_CONTACTS ?? '',
  products:       process.env.NOTION_DB_PRODUCTS ?? '',
  projects:       process.env.NOTION_DB_PROJECTS ?? '',
  tasks:          process.env.NOTION_DB_TASKS ?? '',
  quotes:         process.env.NOTION_DB_QUOTES ?? '',
  purchaseOrders: process.env.NOTION_DB_PURCHASE_ORDERS ?? '',
  production:     process.env.NOTION_DB_PRODUCTION ?? '',
  inspections:    process.env.NOTION_DB_INSPECTIONS ?? '',
  shipments:      process.env.NOTION_DB_SHIPMENTS ?? '',
  imports:        process.env.NOTION_DB_IMPORTS ?? '',
  expenses:       process.env.NOTION_DB_EXPENSES ?? '',
  payments:       process.env.NOTION_DB_PAYMENTS ?? '',
  claims:         process.env.NOTION_DB_CLAIMS ?? '',
  certificates:   process.env.NOTION_DB_CERTIFICATES ?? '',
  contracts:      process.env.NOTION_DB_CONTRACTS ?? '',
  documents:      process.env.NOTION_DB_DOCUMENTS ?? '',
  approvals:      process.env.NOTION_DB_APPROVALS ?? '',
  activityLogs:   process.env.NOTION_DB_ACTIVITY_LOGS ?? '',
  inventory:      process.env.NOTION_DB_INVENTORY ?? '',
  costs:          process.env.NOTION_DB_COSTS ?? '',
  estimatorCases: process.env.NOTION_DB_ESTIMATOR ?? '',
  profitAnalysis: process.env.NOTION_DB_PROFIT_ANALYSIS ?? '',
  tradeStatements: process.env.NOTION_DB_TRADE_STATEMENTS ?? '',
} as const;

export function isDemoMode(): boolean {
  return DEMO_MODE;
}

export async function queryDatabase(
  dbId: string,
  params: Omit<Parameters<Client['databases']['query']>[0], 'database_id'> = {}
) {
  if (!dbId) return { results: [], has_more: false, next_cursor: null };
  const notion = getNotionClient();
  try {
    return await notion.databases.query({ database_id: dbId, ...params });
  } catch (err) {
    console.error('[Notion] queryDatabase error:', err);
    return { results: [], has_more: false, next_cursor: null };
  }
}

export async function createPage(
  dbId: string,
  properties: Parameters<Client['pages']['create']>[0]['properties']
) {
  const notion = getNotionClient();
  return notion.pages.create({
    parent: { database_id: dbId },
    properties,
  });
}

export async function updatePage(
  pageId: string,
  properties: Parameters<Client['pages']['update']>[0]['properties']
) {
  const notion = getNotionClient();
  return notion.pages.update({ page_id: pageId, properties });
}

export function richText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return (value as Array<{ plain_text: string }>).map((r) => r.plain_text).join('');
}

export function titleText(prop: { title?: Array<{ plain_text: string }> } | undefined): string {
  return richText(prop?.title);
}
