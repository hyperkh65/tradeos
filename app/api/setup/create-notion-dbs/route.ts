import { NextRequest, NextResponse } from 'next/server';
import { getNotionClient, DB } from '@/lib/notion/client';

const SCHEMAS = {
  claims: {
    name: '클레임',
    secret: 'TRADEOS_NOTION_DB_CLAIMS',
    properties: {
      '클레임번호': { title: {} },
      '이슈유형': { select: { options: [
        { name: '불량', color: 'red' }, { name: '수량부족', color: 'orange' },
        { name: '배송지연', color: 'yellow' }, { name: '파손', color: 'pink' }, { name: '기타', color: 'gray' },
      ] } },
      '상태': { select: { options: [
        { name: '접수', color: 'gray' }, { name: '내부확인', color: 'blue' },
        { name: '업체전달', color: 'yellow' }, { name: '협상', color: 'orange' },
        { name: '합의', color: 'green' }, { name: '완료', color: 'green' },
      ] } },
      '고객사': { rich_text: {} },
      '공급업체': { rich_text: {} },
      '제품명': { rich_text: {} },
      '발주번호': { rich_text: {} },
      '매출번호': { rich_text: {} },
      '클레임금액': { number: { format: 'number' } },
      '통화': { select: { options: [
        { name: 'USD', color: 'green' }, { name: 'CNY', color: 'red' }, { name: 'KRW', color: 'blue' },
      ] } },
      '처리방법': { select: { options: [
        { name: '교환', color: 'blue' }, { name: '환불', color: 'red' },
        { name: '할인', color: 'yellow' }, { name: '보상', color: 'orange' },
      ] } },
      '처리금액': { number: { format: 'number' } },
      '설명': { rich_text: {} },
    },
  },
  inspections: {
    name: '검품',
    secret: 'TRADEOS_NOTION_DB_INSPECTIONS',
    properties: {
      '검품번호': { title: {} },
      '공급업체': { rich_text: {} },
      '제품명': { rich_text: {} },
      '발주번호': { rich_text: {} },
      '검품유형': { select: { options: [
        { name: '공장검품', color: 'blue' }, { name: '선적전검품', color: 'green' },
        { name: '입고검품', color: 'orange' },
      ] } },
      '검품일': { date: {} },
      '결과': { select: { options: [
        { name: '합격', color: 'green' }, { name: '조건부합격', color: 'yellow' },
        { name: '불합격', color: 'red' }, { name: '판정대기', color: 'gray' },
      ] } },
      '상태': { select: { options: [
        { name: '예정', color: 'gray' }, { name: '진행중', color: 'blue' },
        { name: '완료', color: 'green' }, { name: '취소', color: 'red' },
      ] } },
      '검품자': { rich_text: {} },
      '샘플수량': { number: { format: 'number' } },
      '검품수량': { number: { format: 'number' } },
      '불량수량': { number: { format: 'number' } },
      '불량률': { number: { format: 'percent' } },
      '요약': { rich_text: {} },
      '의견': { rich_text: {} },
    },
  },
} as const;

export async function POST(req: NextRequest) {
  try {
    const { parentPageId } = await req.json();
    if (!parentPageId) return NextResponse.json({ error: '부모 페이지 ID가 필요합니다' }, { status: 400 });

    const notion = getNotionClient();
    const results: Record<string, { id: string; url: string; secret: string }> = {};
    const errors: Record<string, string> = {};

    for (const [key, schema] of Object.entries(SCHEMAS)) {
      const existingId = DB[key as keyof typeof DB];
      if (existingId) {
        results[schema.name] = { id: existingId, url: `https://notion.so/${existingId.replace(/-/g, '')}`, secret: schema.secret };
        continue;
      }
      try {
        const db = await notion.databases.create({
          parent: { type: 'page_id', page_id: parentPageId },
          title: [{ type: 'text', text: { content: schema.name } }],
          properties: schema.properties as any,
        });
        results[schema.name] = {
          id: db.id,
          url: `https://notion.so/${db.id.replace(/-/g, '')}`,
          secret: schema.secret,
        };
      } catch (e: any) {
        errors[schema.name] = e?.message || String(e);
      }
    }

    // Build gh secret set commands
    const commands = Object.values(results).map(r =>
      `gh secret set ${r.secret} --repo hyperkh65/tradeos <<< "${r.id}"`
    );

    return NextResponse.json({ results, errors, commands, note: '아래 명령어를 터미널에서 실행 후 재배포하세요' });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
