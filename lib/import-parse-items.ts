interface ParsedItem {
  productName: string;
  hsCode?: string;
  dutyRate?: number;
  customsValue?: number;
  qty?: number;
}

function detectColumns(headerRow: (string | number | null | undefined)[]): Record<string, number> {
  const map: Record<string, number> = {};
  const PATTERNS: Record<string, RegExp[]> = {
    productName: [/品名|品目|商品名|제품명|품명|상품명|product\s*name|item\s*name|description\s*of\s*goods|description|commodity|goods|material|货物/i],
    hsCode:      [/HS\s*code|HS\s*no|H\.S\.|关税号|税则号|세번|tariff\s*code/i],
    qty:         [/数量|qty|quantity|件数|수량|pcs|pieces|개수|no\.\s*of\s*pcs|total\s*pcs/i],
    unitPrice:   [/单价|unit\s*price|unit\s*value|단가|price\s*per|u\/p/i],
    customsValue:[/过税价|课税价|과세가격|customs.*value|taxable|invoice.*amount|total\s*amount|total\s*value|amount|金額|금액|合计|小计/i],
    dutyRate:    [/关税率|duty.*rate|세율|tariff\s*rate/i],
  };
  headerRow.forEach((cell, i) => {
    const s = String(cell ?? '').trim();
    if (!s) return;
    for (const [field, pats] of Object.entries(PATTERNS)) {
      if (map[field] !== undefined) continue;
      if (pats.some(p => p.test(s))) map[field] = i;
    }
  });
  return map;
}

function coerceNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? undefined : n;
}

function coerceStr(v: unknown): string {
  return String(v ?? '').trim();
}

async function parseCSV(buf: Buffer): Promise<ParsedItem[]> {
  const text = buf.toString('utf-8');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };

  const header = parseCSVLine(lines[0]);
  const cols = detectColumns(header);
  const items: ParsedItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const name = cols.productName !== undefined ? coerceStr(row[cols.productName]) : '';
    if (!name) continue;
    const cv = cols.customsValue !== undefined ? coerceNum(row[cols.customsValue]) : undefined;
    const up = cols.unitPrice !== undefined ? coerceNum(row[cols.unitPrice]) : undefined;
    const qty = cols.qty !== undefined ? coerceNum(row[cols.qty]) : undefined;
    items.push({
      productName: name,
      hsCode: cols.hsCode !== undefined ? coerceStr(row[cols.hsCode]) || undefined : undefined,
      qty,
      customsValue: cv ?? (up && qty ? Math.round(up * qty) : undefined),
      dutyRate: cols.dutyRate !== undefined ? coerceNum(row[cols.dutyRate]) : undefined,
    });
  }
  return items;
}

async function parseExcel(buf: Buffer, sheetName?: string): Promise<ParsedItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = sheetName
    ? (wb.getWorksheet(sheetName) ?? wb.worksheets[0])
    : wb.worksheets[0];
  if (!ws) return [];

  const allRows: (string | number | null | undefined)[][] = [];
  ws.eachRow((row: { values: (string | number | null | undefined)[] }) => {
    allRows.push(Array.from(row.values).slice(1)); // exceljs는 1-indexed
  });

  if (allRows.length < 2) return [];

  let bestHeaderIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(20, allRows.length - 1); i++) {
    const score = Object.keys(detectColumns(allRows[i])).length;
    if (score > bestScore) { bestScore = score; bestHeaderIdx = i; }
  }

  const cols = detectColumns(allRows[bestHeaderIdx]);
  const items: ParsedItem[] = [];
  const SKIP = /합계|총계|total|subtotal|grand/i;

  for (let i = bestHeaderIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    const name = cols.productName !== undefined ? coerceStr(row[cols.productName]) : '';
    if (!name || SKIP.test(name)) continue;
    const cv = cols.customsValue !== undefined ? coerceNum(row[cols.customsValue]) : undefined;
    const up = cols.unitPrice !== undefined ? coerceNum(row[cols.unitPrice]) : undefined;
    const qty = cols.qty !== undefined ? coerceNum(row[cols.qty]) : undefined;
    items.push({
      productName: name,
      hsCode: cols.hsCode !== undefined ? coerceStr(row[cols.hsCode]) || undefined : undefined,
      qty,
      customsValue: cv ?? (up && qty ? Math.round(up * qty) : undefined),
      dutyRate: cols.dutyRate !== undefined ? coerceNum(row[cols.dutyRate]) : undefined,
    });
  }

  // 헤더를 전혀 못 찾았을 때: 첫 텍스트 컬럼 = 품명, 마지막 숫자 컬럼 = 금액으로 추정
  if (items.length === 0 && bestScore === 0) {
    const dataStart = bestHeaderIdx + 1;
    for (let i = dataStart; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row.length) continue;
      const firstText = row.find(c => typeof c === 'string' && c.trim().length > 1);
      if (!firstText) continue;
      const name = coerceStr(firstText);
      if (SKIP.test(name)) continue;
      const nums = row.map((c, idx) => ({ v: coerceNum(c), idx })).filter(x => x.v != null && x.v > 0);
      const lastNum = nums.at(-1);
      items.push({
        productName: name,
        customsValue: lastNum?.v,
        qty: nums.length > 1 ? nums[0].v : undefined,
      });
    }
  }

  return items;
}

// Excel 시트 목록만 반환
export async function getSheetsFromBuffer(buf: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets.map((ws: { name: string }) => ws.name);
}

// mode='sheets': 시트 목록 반환 / mode='parse'(default): 항목 파싱
export async function parseItemsFromFile(
  file: File,
  sheetName?: string,
  mode: 'sheets' | 'parse' = 'parse',
): Promise<Response> {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
      return Response.json({ error: 'Excel(.xlsx/.xls) 또는 CSV 파일만 지원합니다' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // 시트 목록만 요청
    if (mode === 'sheets' && ext !== 'csv') {
      const sheets = await getSheetsFromBuffer(buf);
      return Response.json({ sheets });
    }

    const items = ext === 'csv' ? await parseCSV(buf) : await parseExcel(buf, sheetName);

    return Response.json({
      data: items,
      count: items.length,
      sheets: [], // 항상 포함 (클라이언트 분기용)
      message: items.length > 0
        ? `${items.length}개 품목 파싱 완료`
        : '인식된 품목 없음 — 헤더명(品名/Qty/Amount 등)을 확인하세요',
    });
  } catch (e) {
    console.error('[parse-items]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
