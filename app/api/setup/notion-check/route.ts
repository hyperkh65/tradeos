import { NextResponse } from 'next/server';
import { getNotionClient, DB } from '@/lib/notion/client';

const DB_LABELS: Record<string, string> = {
  companies:      '거래처 (NOTION_DB_COMPANIES)',
  products:       '제품 (NOTION_DB_PRODUCTS)',
  tasks:          '업무 (NOTION_DB_TASKS)',
  quotes:         '견적 (NOTION_DB_QUOTES)',
  purchaseOrders: '발주 (NOTION_DB_PURCHASE_ORDERS)',
  shipments:      '선적 (NOTION_DB_SHIPMENTS)',
  imports:        '수입통관 (NOTION_DB_IMPORTS)',
  expenses:       '비용 (NOTION_DB_EXPENSES)',
  claims:         '클레임 (NOTION_DB_CLAIMS)',
  inspections:    '검품 (NOTION_DB_INSPECTIONS)',
  inventory:      '재고 (NOTION_DB_INVENTORY)',
  approvals:      '결재 (NOTION_DB_APPROVALS)',
};

export async function GET() {
  const token = process.env.NOTION_TOKEN || '';
  const tokenOk = token.length > 10;

  const results: Record<string, { set: boolean; reachable?: boolean; error?: string }> = {};

  for (const [key, label] of Object.entries(DB_LABELS)) {
    const dbId = DB[key as keyof typeof DB];
    if (!dbId) { results[label] = { set: false }; continue; }

    // Try a minimal query to verify the DB is accessible
    try {
      const notion = getNotionClient();
      await notion.databases.retrieve({ database_id: dbId });
      results[label] = { set: true, reachable: true };
    } catch (e: any) {
      results[label] = { set: true, reachable: false, error: e?.code || String(e).slice(0, 80) };
    }
  }

  return NextResponse.json({
    notionToken: tokenOk ? '✅ 설정됨' : '❌ 미설정 (NOTION_TOKEN)',
    databases: results,
  });
}
