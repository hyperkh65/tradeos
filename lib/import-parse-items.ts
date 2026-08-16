interface ParsedItem {
  productName: string;
  hsCode?: string;
  dutyRate?: number;
  customsValue?: number;
  qty?: number;
  unitPrice?: number;
}

// ── cell value unwrapping ────────────────────────────────────────────────────
// exceljs formula: { formula: "F12*I12", result: 62425 }
// exceljs richText: { richText: [{text: "..."}] }
function unwrapCell(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return o.result;
    if ('richText' in o)
      return (o.richText as Array<{ text?: string }>).map(t => t.text || '').join('');
  }
  return v;
}

function coerceNum(v: unknown): number | undefined {
  v = unwrapCell(v);
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return isNaN(v) ? undefined : v;
  const n = parseFloat(String(v).replace(/[$€¥₩,\s]|USD|CNY|EUR|KRW/gi, ''));
  return isNaN(n) ? undefined : n;
}

function coerceStr(v: unknown): string {
  v = unwrapCell(v);
  return String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
}

// 멀티라인/과잉공백 헤더 정규화
function normalizeHeader(v: unknown): string {
  return String(unwrapCell(v) ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── 컬럼 패턴 ────────────────────────────────────────────────────────────────
const COL_PATTERNS: Record<string, RegExp> = {
  productName:  /品名|品目|商品名|제품명|품명|상품명|product\s*name|item\s*name|description(\s*of\s*goods)?|commodity|goods|material|货物/i,
  itemCode:     /item\s*#|item\s*no\.?|p\/n|part\s*no\.?|model\s*(no\.?)?|sku|ref\s*#|품번|모델|규격|spec/i,
  hsCode:       /HS\s*code|HS\s*no\.?|H\.S\.|关税号|税则号|세번|tariff\s*code/i,
  qty:          /数量|q.{0,2}ty|quantity|件数|수량|^pcs$|pieces|개수|no\.\s*of\s*pcs/i,
  unitPrice:    /单价|unit\s*price|unit\s*value|단가|price\s*per|u\/p|u\.p\./i,
  customsValue: /过税价|课税价|과세가격|customs.*value|taxable|invoice.*amount|total\s*(amount|value)|^amount$|金額|금액|合计|小计/i,
  dutyRate:     /关税率|duty.*rate|세율|tariff\s*rate/i,
};

function detectColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((s, i) => {
    if (!s) return;
    for (const [field, pat] of Object.entries(COL_PATTERNS)) {
      if (map[field] !== undefined) continue;
      if (pat.test(s)) map[field] = i;
    }
  });
  return map;
}

// ── 행이 데이터 행인지 판단 ──────────────────────────────────────────────────
const SKIP_ROW = /^(합계|총계|total\b|subtotal|grand\s*total|country\s*of\s*orig|원산지|주의|note|remark|signature|approved)/i;

function isDataRow(row: unknown[], cols: Record<string, number>): boolean {
  // productName 컬럼이 있으면 그 값으로 판단
  if (cols.productName !== undefined) {
    const name = coerceStr(row[cols.productName]);
    return name.length >= 2 && !SKIP_ROW.test(name);
  }
  // 없으면 첫 텍스트 컬럼으로 판단
  const firstText = row.map(c => coerceStr(c)).find(s => s.length >= 2);
  return !!firstText && !SKIP_ROW.test(firstText);
}

// ── 숫자 컬럼 추론 (헤더 미탐지 fallback) ───────────────────────────────────
function inferNumericCol(dataRows: unknown[][], exclude: number[]): number | undefined {
  if (!dataRows.length) return undefined;
  const colCount = Math.max(...dataRows.map(r => r.length));
  const scores: number[] = new Array(colCount).fill(0);
  for (const row of dataRows) {
    for (let i = 0; i < row.length; i++) {
      if (exclude.includes(i)) continue;
      const v = coerceNum(row[i]);
      if (v !== undefined && v > 0) scores[i]++;
    }
  }
  // 가장 오른쪽에 있는 점수 높은 컬럼
  let best = -1, bestScore = 0;
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i] >= dataRows.length * 0.5 && scores[i] > bestScore) {
      bestScore = scores[i]; best = i;
    }
  }
  return best >= 0 ? best : undefined;
}

// ── 금액 반올림 (소수점 오차 정리) ──────────────────────────────────────────
function roundAmount(v: number | undefined): number | undefined {
  if (v === undefined) return undefined;
  return Math.round(v * 100) / 100;
}

// ── CSV 파싱 ─────────────────────────────────────────────────────────────────
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

  const headers = parseCSVLine(lines[0]).map(normalizeHeader);
  const cols = detectColumns(headers);
  const items: ParsedItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (!isDataRow(row, cols)) continue;
    const name = cols.productName !== undefined ? coerceStr(row[cols.productName]) : '';
    if (!name) continue;
    const up = cols.unitPrice !== undefined ? coerceNum(row[cols.unitPrice]) : undefined;
    const qty = cols.qty !== undefined ? coerceNum(row[cols.qty]) : undefined;
    const cv = cols.customsValue !== undefined ? coerceNum(row[cols.customsValue]) : undefined;
    const finalCv = roundAmount((cv && cv > 0) ? cv : (up && qty ? up * qty : undefined));
    items.push({
      productName: name,
      hsCode: cols.hsCode !== undefined ? coerceStr(row[cols.hsCode]) || undefined : undefined,
      qty, unitPrice: up, customsValue: finalCv,
      dutyRate: cols.dutyRate !== undefined ? coerceNum(row[cols.dutyRate]) : undefined,
    });
  }
  return items;
}

// ── Excel 파싱 ───────────────────────────────────────────────────────────────
async function parseExcel(buf: Buffer, sheetName?: string): Promise<ParsedItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = sheetName ? (wb.getWorksheet(sheetName) ?? wb.worksheets[0]) : wb.worksheets[0];
  if (!ws) return [];

  const allRows: unknown[][] = [];
  ws.eachRow((row: { values: unknown[] }) => {
    allRows.push(Array.from(row.values).slice(1)); // exceljs 1-indexed
  });
  if (allRows.length < 2) return [];

  // ① 헤더 행 탐색 (최대 25행, 컬럼 매칭 점수 최고인 행)
  let bestHeaderIdx = 0, bestScore = 0;
  for (let i = 0; i < Math.min(25, allRows.length - 1); i++) {
    const headers = allRows[i].map(normalizeHeader);
    const score = Object.keys(detectColumns(headers)).length;
    if (score > bestScore) { bestScore = score; bestHeaderIdx = i; }
  }

  const headers = allRows[bestHeaderIdx].map(normalizeHeader);
  const cols = detectColumns(headers);

  const dataRows = allRows.slice(bestHeaderIdx + 1);

  // ② 숫자 컬럼 추론 — 헤더로 못 찾은 컬럼 보완
  const foundNumCols = [cols.qty, cols.unitPrice, cols.customsValue, cols.dutyRate].filter((c): c is number => c !== undefined);

  if (cols.customsValue === undefined) {
    // amount 컬럼 후보: 오른쪽 숫자 컬럼
    const inferred = inferNumericCol(dataRows, foundNumCols);
    if (inferred !== undefined) { cols.customsValue = inferred; foundNumCols.push(inferred); }
  }
  if (cols.unitPrice === undefined && cols.qty !== undefined && cols.customsValue !== undefined) {
    // unit price: qty, amount 사이 숫자 컬럼
    const between = inferNumericCol(dataRows,
      foundNumCols.filter(c => c !== cols.qty && c !== cols.customsValue));
    if (between !== undefined) cols.unitPrice = between;
  }

  const items: ParsedItem[] = [];

  for (const row of dataRows) {
    if (!isDataRow(row, cols)) continue;

    // 품목명: description 컬럼 우선, itemCode 컬럼을 앞에 붙여 식별성 향상
    const desc = cols.productName !== undefined ? coerceStr(row[cols.productName]) : '';
    const code = cols.itemCode !== undefined ? coerceStr(row[cols.itemCode]) : '';
    if (!desc && !code) continue;

    const name = (code && desc && code !== desc)
      ? `[${code}] ${desc}`
      : (desc || code);

    const up = cols.unitPrice !== undefined ? coerceNum(row[cols.unitPrice]) : undefined;
    const qty = cols.qty !== undefined ? coerceNum(row[cols.qty]) : undefined;
    const cv = cols.customsValue !== undefined ? coerceNum(row[cols.customsValue]) : undefined;
    const finalCv = roundAmount((cv && cv > 0) ? cv : (up && qty ? up * qty : undefined));

    items.push({
      productName: name,
      hsCode: cols.hsCode !== undefined ? coerceStr(row[cols.hsCode]) || undefined : undefined,
      qty, unitPrice: up, customsValue: finalCv,
      dutyRate: cols.dutyRate !== undefined ? coerceNum(row[cols.dutyRate]) : undefined,
    });
  }

  // ③ 완전 fallback: 헤더를 전혀 못 찾았을 때 첫 텍스트=품명, 마지막 숫자=금액
  if (items.length === 0) {
    for (const row of dataRows) {
      const firstText = row.map(c => coerceStr(c)).find(s => s.length >= 2 && !SKIP_ROW.test(s));
      if (!firstText) continue;
      const nums = row.map(c => coerceNum(c)).filter((v): v is number => v !== undefined && v > 0);
      items.push({
        productName: firstText,
        customsValue: roundAmount(nums.at(-1)),
        qty: nums.length > 1 ? nums[0] : undefined,
      });
    }
  }

  return items;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────
export async function getSheetsFromBuffer(buf: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets.map((ws: { name: string }) => ws.name);
}

export async function parseItemsFromFile(
  file: File,
  sheetName?: string,
  mode: 'sheets' | 'parse' = 'parse',
): Promise<Response> {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext))
      return Response.json({ error: 'Excel(.xlsx/.xls) 또는 CSV 파일만 지원합니다' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());

    if (mode === 'sheets' && ext !== 'csv') {
      const sheets = await getSheetsFromBuffer(buf);
      return Response.json({ sheets });
    }

    const items = ext === 'csv' ? await parseCSV(buf) : await parseExcel(buf, sheetName);

    return Response.json({
      data: items,
      count: items.length,
      sheets: [],
      message: items.length > 0
        ? `${items.length}개 품목 파싱 완료`
        : '인식된 품목 없음 — 헤더명(品名/Qty/Amount 등)을 확인하세요',
    });
  } catch (e) {
    console.error('[parse-items]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
