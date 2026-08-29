/**
 * NOTION_DB_* 24개는 API 토큰이 아니라 Notion 데이터베이스 ID라 민감정보는 아니지만
 * (secrets.enc에 넣을 이유는 없음), 앱이 뜨려면 반드시 필요한 설정값이다 — 여기 없으면
 * "시크릿은 복구했는데 어떤 Notion DB를 연결해야 할지 모른다"는 상황이 생긴다. 그래서
 * 암호화하지 않는 별도 /config/application-config.json으로 백업한다.
 */
export interface NonSecretAppConfig {
  port: string;
  docverifyContainer: string;
  aiEnabled: string;
  notionDbIds: Record<string, string>;
}

const NOTION_DB_ENV_KEYS = [
  'NOTION_DB_COMPANIES', 'NOTION_DB_PRODUCTS', 'NOTION_DB_TASKS', 'NOTION_DB_PURCHASE_ORDERS',
  'NOTION_DB_INSPECTIONS', 'NOTION_DB_SHIPMENTS', 'NOTION_DB_QUOTES', 'NOTION_DB_IMPORTS',
  'NOTION_DB_CLAIMS', 'NOTION_DB_EXPENSES', 'NOTION_DB_HR', 'NOTION_DB_INVENTORY', 'NOTION_DB_SALES',
  'NOTION_DB_PROFIT_ANALYSIS', 'NOTION_DB_ESTIMATOR', 'NOTION_DB_APPROVALS', 'NOTION_DB_TRADE_STATEMENTS',
  'NOTION_DB_COMMISSIONS', 'NOTION_DB_ACTIVITY_LOGS', 'NOTION_DB_CERTIFICATES', 'NOTION_DB_CONTACTS',
  'NOTION_DB_CONTRACTS', 'NOTION_DB_DEPARTMENTS', 'NOTION_DB_DOCUMENTS', 'NOTION_DB_EMPLOYEES',
  'NOTION_DB_PAYMENTS', 'NOTION_DB_PRODUCTION', 'NOTION_DB_PROJECTS',
];

export function collectNonSecretConfig(): NonSecretAppConfig {
  const notionDbIds: Record<string, string> = {};
  for (const key of NOTION_DB_ENV_KEYS) {
    if (process.env[key]) notionDbIds[key] = process.env[key] as string;
  }
  return {
    port: process.env.PORT || '3103',
    docverifyContainer: process.env.DOCVERIFY_CONTAINER || 'tradeos-docverify',
    aiEnabled: process.env.AI_ENABLED || 'true',
    notionDbIds,
  };
}
