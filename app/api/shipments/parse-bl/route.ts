import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

// pdfjs-dist가 Node.js에서 DOMMatrix를 요구하므로 폴리필
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a=1; b=0; c=0; d=1; e=0; f=0;
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    multiply(o: any) {
      const r = new (globalThis as any).DOMMatrix();
      r.a = this.a*o.a + this.b*o.c; r.b = this.a*o.b + this.b*o.d;
      r.c = this.c*o.a + this.d*o.c; r.d = this.c*o.b + this.d*o.d;
      r.e = this.e*o.a + this.f*o.c + o.e; r.f = this.e*o.b + this.f*o.d + o.f;
      return r;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformPoint(p: any) {
      return { x: (p.x??0)*this.a + (p.y??0)*this.c + this.e, y: (p.x??0)*this.b + (p.y??0)*this.d + this.f };
    }
    translate(tx=0, ty=0) {
      return new (globalThis as any).DOMMatrix([this.a, this.b, this.c, this.d, this.e+tx, this.f+ty]);
    }
    scale(sx=1, sy=1) {
      return new (globalThis as any).DOMMatrix([this.a*sx, this.b*sx, this.c*sy, this.d*sy, this.e, this.f]);
    }
  };
}

// ── Worker 경로 ────────────────────────────────────────────────────────────────
async function getWorkerSrc(): Promise<string> {
  const { createRequire } = await import('module');
  const { join } = await import('path');
  try {
    const req = createRequire(join(process.cwd(), '_dummy_'));
    return `file://${req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')}`;
  } catch {
    return `file://${join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')}`;
  }
}

// ── Strategy 1: pdf-parse v2 (lineEnforce + cellSeparator) ────────────────────
async function extractWithPdfParse(buf: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const workerSrc = await getWorkerSrc();
  PDFParse.setWorker(workerSrc);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText({
    lineEnforce: true,
    lineThreshold: 3,
    cellSeparator: '\t',
    cellThreshold: 15,
  });
  return result.text;
}

// ── Strategy 2: pdfjs-dist 직접 (좌표 기반 행/열 그룹화) ─────────────────────
async function extractWithPdfJs(buf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = await getWorkerSrc();

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pageTexts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = content.items as Array<{ str: string; transform: number[]; width?: number }>;

    type Row = { y: number; cols: { x: number; w: number; str: string }[] };
    const rows: Row[] = [];
    for (const item of items) {
      if (!item.str) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, cols: [] }; rows.push(row); }
      row.cols.push({ x, w: item.width ?? 0, str: item.str });
    }
    rows.sort((a, b) => b.y - a.y);

    const lines = rows.map(r => {
      r.cols.sort((a, b) => a.x - b.x);
      let line = '';
      for (let i = 0; i < r.cols.length; i++) {
        if (i > 0) {
          const gap = r.cols[i].x - (r.cols[i-1].x + r.cols[i-1].w);
          line += gap > 20 ? '\t' : ' ';
        }
        line += r.cols[i].str;
      }
      return line;
    }).filter(l => l.trim());

    pageTexts.push(lines.join('\n'));
  }
  return pageTexts.join('\n\n');
}

async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    const text = await extractWithPdfParse(buf);
    if (text.trim().length > 30) return text;
  } catch (e) {
    console.warn('[parse-bl] pdf-parse failed, trying pdfjs:', e);
  }
  return extractWithPdfJs(buf);
}

// ── 파서 헬퍼 ─────────────────────────────────────────────────────────────────

// 탭과 콜론 모두 허용하는 레이블 검색
function findField(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

// 탭·콜론·공백으로 구분된 레이블 → 값 검색 (다음 줄도 탐색)
function findAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 같은 줄: "LABEL  :  VALUE" 또는 "LABEL\tVALUE"
    const reSame = new RegExp(esc + '[\\s\\t:：]*([^\\n\\r\\t]{2,60})', 'i');
    const m1 = reSame.exec(text);
    if (m1?.[1]?.trim()) {
      const v = m1[1].replace(/^[\s:：]+/, '').trim();
      if (v.length >= 2) return v;
    }
    // 다음 줄: "LABEL\nVALUE"
    const reNext = new RegExp(esc + '[\\s\\t:：]*\\n([^\\n\\r\\t]{2,60})', 'i');
    const m2 = reNext.exec(text);
    if (m2?.[1]?.trim()) return m2[1].trim();
  }
  return null;
}

// 탭 구분 행에서 레이블-값 쌍 맵 구성
function buildLabelMap(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split('\n')) {
    const parts = line.split('\t').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const key = parts[0].replace(/[:：]+$/, '').trim().toUpperCase();
      const val = parts.slice(1).join(' ').trim();
      if (key && val && !map.has(key)) map.set(key, val);
    }
    // 같은 줄에서 복수의 키:값 (탭으로 분리된 셀들)
    for (const part of parts) {
      const ci = part.indexOf(':');
      if (ci > 0 && ci < part.length - 1) {
        const k = part.slice(0, ci).trim().toUpperCase();
        const v = part.slice(ci + 1).trim();
        if (k && v && !map.has(k)) map.set(k, v);
      }
    }
  }
  return map;
}

function labelLookup(map: Map<string, string>, ...labels: string[]): string | null {
  for (const label of labels) {
    const v = map.get(label.toUpperCase());
    if (v) return v;
    // 부분 매칭
    for (const [k, val] of map) {
      if (k.includes(label.toUpperCase()) || label.toUpperCase().includes(k)) {
        if (val) return val;
      }
    }
  }
  return null;
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const months: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  };
  let m: RegExpExecArray | null;
  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  m = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(raw);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  // DD MMM YYYY or MMM DD YYYY or MMM DD, YYYY
  m = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/.exec(raw);
  if (m) { const mo = months[m[2].toLowerCase()]; if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`; }
  m = /([A-Za-z]{3})\s+(\d{1,2})[,\s]+(\d{4})/.exec(raw);
  if (m) { const mo = months[m[1].toLowerCase()]; if (mo) return `${m[3]}-${mo}-${m[2].padStart(2,'0')}`; }
  // YYYYMMDD
  m = /(\d{4})(\d{2})(\d{2})/.exec(raw);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function extractNumber(raw: string | null): number | null {
  if (!raw) return null;
  const m = /([\d,]+\.?\d*)/.exec(raw);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

function findContainerNos(text: string): string[] {
  const re = /\b([A-Z]{4}[0-9]{6,7})\b/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) seen.add(m[1]);
  return [...seen];
}

function findSealNos(text: string): string[] {
  const re = /(?:seal\s*no[.:\t]?\s*|씰번호[：:\t\s]*)([\w-]{4,20})/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return [...new Set(out)];
}

// ── 메인 파서 ──────────────────────────────────────────────────────────────────
function parseBLText(rawText: string): Record<string, unknown> {
  // 정규화: CRLF → LF, 연속 공백 → 단일 공백 (탭은 유지)
  const t = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ ]{2,}/g, ' ');

  const labelMap = buildLabelMap(t);

  // ── B/L No ─────────────────────────────────────────────────────────────────
  const blNo =
    labelLookup(labelMap,
      'B/L NO', 'BL NO', 'HBL NO', 'HOUSE B/L NO', 'H.B.L NO', 'BILL NO',
      'B.L.NO', 'HOUSE BILL OF LADING NO', 'HOUSE B/L NUMBER',
    ) ||
    findField(t, [
      /(?:House\s+)?B[\/.]?L\.?\s*N[Oo]\.?\s*[:\t]+\s*([A-Z0-9-]{5,30})/i,
      /H\.?B\.?L\.?\s*N[Oo]\.?\s*[:\t]+\s*([A-Z0-9-]{5,30})/i,
      /BILL\s+NO\.?\s*[:\t]+\s*([A-Z0-9-]{5,30})/i,
      /B(?:ILL)?\s*OF\s*LADING\s*N[Oo]\.?\s*[:\t]+\s*([A-Z0-9-]{5,30})/i,
      // 상단에 단독으로 있는 B/L 번호 (레이블 없이)
      /\b((?:HBL|MBL|SHL|YNK|HDB|COS|EMC|MSK|MSC|EVR|PIL|ANL|WHL|TSL|SIN)[A-Z0-9]{4,20})\b/,
    ]) ||
    // 숫자 덩어리 없이 레이블 아래 다음 행에서 추출
    (() => {
      const blLabelRe = /(?:B[\/.]?L|H\.?B\.?L|House\s+Bill)[^a-z\n]{0,20}\n([A-Z0-9-]{6,25})/i;
      const m = blLabelRe.exec(t);
      return m?.[1] ?? null;
    })();

  // ── 선박명 + 항차 ────────────────────────────────────────────────────────────
  const vesselRaw =
    labelLookup(labelMap,
      'VESSEL', 'VESSEL NAME', 'VESSEL NO', 'SHIP NAME', 'OCEAN VESSEL', '선박명',
    ) ||
    findField(t, [
      /VESSEL\s*(?:NO\.?|NAME)?\s*[:\t]+\s*([^\n\t/]{3,50}?)(?:\s+V\.\w|\s+VOY|\s*\t|\n|$)/i,
      /Ocean\s+Vessel\s*[:\t]+\s*([^\n\t/]{3,40}?)(?:\s+VOY|\s*\t|\n|$)/i,
    ]) ||
    findAfterLabel(t, ['Ocean Vessel', 'Vessel Name', 'VESSEL', '선박명']);

  const voyage =
    labelLookup(labelMap, 'VOYAGE NO', 'VOY NO', 'VOYAGE', 'VOY', 'VYG', '항차') ||
    findField(t, [
      /\bV\.(\w{3,12})\b/,
      /Voy(?:age)?\.?\s*N[Oo]\.?\s*[:\t]+\s*([A-Z0-9]{2,15})/i,
      /VOY(?:AGE)?\s*[:\t#]+\s*([A-Z0-9]{2,15})/i,
      /항차\s*[:\t]+\s*([A-Z0-9]{2,15})/i,
    ]);

  let vessel = vesselRaw;
  if (vessel) vessel = vessel.replace(/\s*V\.\w+$/, '').replace(/\s*VOY.*$/i, '').trim();

  // ── 선적항 POL ───────────────────────────────────────────────────────────────
  const pol =
    labelLookup(labelMap,
      'PORT OF LOADING', 'PORT OF LADING', 'PLACE OF RECEIPT', 'POL', 'LOADING PORT', '선적항', '적재항',
    ) ||
    findField(t, [
      /Port\s+of\s+(?:Loading|Lading|Receipt)\s*[:\t]+\s*([^\n\t]{2,50})/i,
      /Place\s+of\s+(?:Receipt|Loading)\s*[:\t]+\s*([^\n\t]{2,50})/i,
      /FROM\s*[:\t]+\s*([^\n\t]{2,40})/i,
      /(?:출발|선적|적재)항\s*[:\t]+\s*([^\n\t]{2,40})/i,
    ]);

  // ── 양륙항 POD ───────────────────────────────────────────────────────────────
  const pod =
    labelLookup(labelMap,
      'PORT OF DISCHARGE', 'PORT OF DESTINATION', 'PLACE OF DELIVERY', 'POD', 'DISCHARGE PORT', '양륙항', '목적항',
    ) ||
    findField(t, [
      /Port\s+of\s+Discharge\s*[:\t]+\s*([^\n\t]{2,50})/i,
      /Place\s+of\s+(?:Delivery|Destination)\s*[:\t]+\s*([^\n\t]{2,50})/i,
      /Final\s+Dest(?:ination)?\s*[:\t]+\s*([^\n\t]{2,50})/i,
      /\bTO\s*[:\t]+\s*([^\n\t]{2,40})/i,
      /(?:도착|양륙|목적)항\s*[:\t]+\s*([^\n\t]{2,40})/i,
    ]);

  // ── ETD / On Board Date ─────────────────────────────────────────────────────
  const etdRaw =
    labelLookup(labelMap,
      'ETD', 'ON BOARD DATE', 'DATE OF SHIPMENT', 'SHIPPED ON BOARD', 'DATE OF ISSUE',
      'SAILING DATE', 'DATE OF SAILING', '선적일', '출항일',
    ) ||
    findField(t, [
      /(?:Shipped\s+)?On\s+Board(?:\s+Date)?\s*[:\t]+\s*([^\n\t]{4,30})/i,
      /ETD\s*[:\t]+\s*([^\n\t]{4,30})/i,
      /Date\s+(?:of\s+)?(?:Shipment|Issue|Sailing)\s*[:\t]+\s*([^\n\t]{4,25})/i,
      /선적일\s*[:\t]+\s*([^\n\t]{4,20})/i,
    ]);
  const etd = parseDate(etdRaw);

  // ── 중량 / 용적 ─────────────────────────────────────────────────────────────
  const gwRaw =
    labelLookup(labelMap, 'GROSS WEIGHT', 'TOTAL GROSS WEIGHT', 'G.W', 'GW', '총중량') ||
    findField(t, [
      /Gross\s+(?:Weight|Wt\.?)\s*[:\t]+\s*([\d,]+\.?\d*)\s*(?:KGS?|LBS?)?/i,
      /G\.?W\.?\s*[:\t]+\s*([\d,]+\.?\d*)\s*(?:KGS?|LBS?)?/i,
      /총?\s*중량\s*[:\t]+\s*([\d,]+\.?\d*)/i,
    ]);
  const grossWeight = extractNumber(gwRaw);

  const cbmRaw =
    labelLookup(labelMap, 'MEASUREMENT', 'VOLUME', 'CBM', 'M3', '용적') ||
    findField(t, [
      /(?:Measurement|Volume|CBM)\s*[:\t]+\s*([\d,]+\.?\d*)\s*(?:CBM|M3)?/i,
      /용적\s*[:\t]+\s*([\d,]+\.?\d*)/i,
    ]);
  const cbm = extractNumber(cbmRaw);

  // ── 컨테이너 / 씰 ───────────────────────────────────────────────────────────
  const cntrNos = findContainerNos(t);
  const containerNo = cntrNos[0] || null;
  const sealNos = findSealNos(t);
  const sealNo = sealNos[0] || null;

  // ── 기타 ───────────────────────────────────────────────────────────────────
  const shipper =
    labelLookup(labelMap, 'SHIPPER', 'EXPORTER', 'SHIPPER/EXPORTER', '송화인') || null;
  const consignee =
    labelLookup(labelMap, 'CONSIGNEE', '수화인') || null;

  return {
    blNo:           blNo || null,
    vessel:         vessel ? vessel.replace(/\s+/g, ' ').trim() : null,
    voyage:         voyage || null,
    pol:            pol ? pol.replace(/\s+/g, ' ').trim() : null,
    pod:            pod ? pod.replace(/\s+/g, ' ').trim() : null,
    etd,
    grossWeight,
    cbm,
    containerNo,
    sealNo,
    allContainerNos: cntrNos,
    shipper,
    consignee,
    _rawText: t.slice(0, 3000), // 디버그 — 더 많이 출력
  };
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    const text = await extractPdfText(buf);

    if (!text.trim()) {
      return NextResponse.json({
        error: 'PDF에서 텍스트를 추출할 수 없습니다. 스캔 이미지 PDF는 지원되지 않습니다.',
      }, { status: 422 });
    }

    const result = parseBLText(text);
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    console.error('[parse-bl]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
