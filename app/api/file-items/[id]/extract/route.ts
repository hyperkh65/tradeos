import { NextRequest, NextResponse } from 'next/server';
import { getDb, newId, now } from '@/lib/db/sqlite';
import { getSessionUser } from '@/lib/auth/session';
import { nasDownload } from '@/lib/storage/nas';
import * as XLSX from 'xlsx';

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return data.text?.slice(0, 6000) || '';
}

function extractTextFromExcel(buffer: Buffer): string {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: false });
  const lines: string[] = [];
  for (const sheetName of wb.SheetNames.slice(0, 3)) {
    const ws = wb.Sheets[sheetName];
    const rows: (string | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as (string | null)[][];
    for (const row of rows.slice(0, 60)) {
      const line = row.filter(c => c !== null && c !== '').join('\t');
      if (line.trim()) lines.push(line);
    }
  }
  return lines.join('\n').slice(0, 6000);
}

async function callClaudeForExtraction(text: string, fileName: string): Promise<{ supplier_name?: string; quote_date?: string; items: { name: string; price: string; unit?: string; quantity?: string }[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');

  const prompt = `다음은 공급업체 견적서 내용입니다. 파일명: ${fileName}

---
${text}
---

위 견적서에서 다음 정보만 추출해주세요. JSON 형식으로만 응답하세요.

{
  "supplier_name": "공급업체명 (없으면 null)",
  "quote_date": "견적일자 YYYY-MM-DD 형식 (없으면 null)",
  "items": [
    {
      "name": "제품명",
      "price": "가격 (숫자와 통화단위 포함, 예: USD 12.50)",
      "unit": "단위 (개, EA, pcs 등, 없으면 null)",
      "quantity": "수량 (없으면 null)"
    }
  ]
}

주의: 반드시 유효한 JSON만 응답하세요. 설명 텍스트 없이.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API 오류: ${res.status}`);
  const json = await res.json();
  const content = json.content?.[0]?.text || '{}';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
  return JSON.parse(jsonMatch[0]);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const item = db.prepare('SELECT * FROM file_items WHERE id=?').get(id) as Record<string,unknown> | undefined;
  if (!item) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

  const fileType = (item.file_type as string) || '';
  const fileName = (item.file_name as string) || '';
  const isPdf = fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
  const isExcel = fileType.includes('sheet') || fileType.includes('excel') || /\.(xlsx?|csv)$/i.test(fileName);

  if (!isPdf && !isExcel) {
    return NextResponse.json({ error: 'PDF 또는 Excel 파일만 추출 가능합니다.' }, { status: 400 });
  }

  const buffer = await nasDownload(item.file_path as string);
  if (!buffer) return NextResponse.json({ error: 'NAS에서 파일을 가져올 수 없습니다.' }, { status: 502 });

  let rawText = '';
  try {
    rawText = isPdf ? await extractTextFromPdf(buffer) : extractTextFromExcel(buffer);
  } catch (e) {
    return NextResponse.json({ error: `텍스트 추출 실패: ${e}` }, { status: 500 });
  }

  let extracted;
  try {
    extracted = await callClaudeForExtraction(rawText, fileName);
  } catch (e) {
    return NextResponse.json({ error: `AI 추출 실패: ${e}` }, { status: 500 });
  }

  const ts = now();
  // upsert
  const existing = db.prepare('SELECT id FROM quote_extractions WHERE file_id=?').get(id) as { id: string } | undefined;
  if (existing) {
    db.prepare('UPDATE quote_extractions SET supplier_name=?,quote_date=?,items_json=?,raw_text=?,status=?,updated_at=? WHERE id=?')
      .run(extracted.supplier_name || null, extracted.quote_date || null, JSON.stringify(extracted.items || []), rawText.slice(0, 2000), 'done', ts, existing.id);
  } else {
    db.prepare('INSERT INTO quote_extractions (id,file_id,supplier_name,quote_date,items_json,raw_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(newId(), id, extracted.supplier_name || null, extracted.quote_date || null, JSON.stringify(extracted.items || []), rawText.slice(0, 2000), 'done', ts, ts);
  }

  const result = db.prepare('SELECT * FROM quote_extractions WHERE file_id=?').get(id);
  return NextResponse.json({ data: result });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const result = db.prepare('SELECT * FROM quote_extractions WHERE file_id=?').get(id);
  return NextResponse.json({ data: result });
}
