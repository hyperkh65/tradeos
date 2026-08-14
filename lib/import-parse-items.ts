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
    productName: [/品名|品目|商品名|제품명|품명|상품명|product|item|description|material|货物/i],
    hsCode:      [/HS|关税号|税则号|세번/i],
    qty:         [/数量|qty|quantity|件数|수량|pcs|개수/i],
    unitPrice:   [/单价|unit\s*price|단가|price/i],
    customsValue:[/过税价|课税价|과세가격|customs.*value|taxable|invoice.*amount|금액|amount|合计|小计/i],
    dutyRate:    [/关税率|duty.*rate|세율|tariff/i],
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

async function parseExcel(buf: Buffer): Promise<ParsedItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const allRows: (string | number | null | undefined)[][] = [];
  ws.eachRow((row: { values: (string | number | null | undefined)[] }) => {
    allRows.push(Array.from(row.values).slice(1)); // exceljs는 1-indexed
  });

  if (allRows.length < 2) return [];

  let bestHeaderIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(10, allRows.length - 1); i++) {
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
  return items;
}

export async function parseItemsFromFile(file: File): Promise<Response> {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
      return Response.json({ error: 'Excel(.xlsx/.xls) 또는 CSV 파일만 지원합니다' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const items = ext === 'csv' ? await parseCSV(buf) : await parseExcel(buf);

    return Response.json({
      data: items,
      count: items.length,
      message: items.length > 0
        ? `${items.length}개 품목 파싱 완료`
        : '인식된 품목 없음 — 헤더명(品名/Qty/Amount 등)을 확인하세요',
    });
  } catch (e) {
    console.error('[parse-items]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
