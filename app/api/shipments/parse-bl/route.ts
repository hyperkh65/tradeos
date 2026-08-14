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

// ── 정규식 헬퍼 ────────────────────────────────────────────────────────────────

function findField(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

// 두 줄 연속 텍스트에서 키워드 다음 값 추출
function findAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // "LABEL : VALUE" 또는 "LABEL\nVALUE"
    const re = new RegExp(escaped + '[\\s:：]*([^\\n\\r]{2,60})', 'i');
    const m = re.exec(text);
    if (m?.[1]?.trim()) {
      const val = m[1].replace(/^\s*[:：]\s*/, '').trim();
      if (val && val.length > 1) return val;
    }
  }
  return null;
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  // YYYY-MM-DD or YYYYMMDD
  let m = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(raw);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // DD MMM YYYY  (e.g. 01 JUL 2025)
  const months: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  };
  m = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/.exec(raw);
  if (m) {
    const mo = months[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
  }
  // MMM DD, YYYY
  m = /([A-Za-z]{3})\s+(\d{1,2})[,\s]+(\d{4})/.exec(raw);
  if (m) {
    const mo = months[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

function extractNumber(raw: string | null): number | null {
  if (!raw) return null;
  const m = /([\d,]+\.?\d*)/.exec(raw.replace(/,/g, ''));
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

// 컨테이너 번호: 4자리 알파벳 + 6~7자리 숫자 + 체크디짓
function findContainerNos(text: string): string[] {
  const re = /\b([A-Z]{4}[0-9]{6,7})\b/g;
  const seen = new Set<string>();
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) seen.add(m[1]);
  }
  return [...seen];
}

// 씰 번호: 보통 6~12자리 알파숫자
function findSealNos(text: string): string[] {
  const re = /(?:seal\s*no[.:]?\s*|씰번호[：:\s]*)([\w-]{4,20})/gi;
  const out: string[] = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

// ── 메인 파서 ──────────────────────────────────────────────────────────────────

function parseBLText(text: string): Record<string, unknown> {
  // 정규화: 줄바꿈 보존, 공백 압축
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');

  // B/L No
  const blNo = findField(t, [
    /B[\/.]?L\s*(?:No|Number|NUM)[.:]?\s*([A-Z0-9-]{6,30})/i,
    /Bill\s+of\s+Lading\s*(?:No|Number)?[.:]?\s*([A-Z0-9-]{6,30})/i,
    /(?:House\s+)?B[\/.]?L\s*(?:No|#)[.:]?\s*([A-Z0-9-]{6,30})/i,
    /\bHBL\b[.:\s]*([A-Z0-9-]{6,30})/i,
    /\bMBL\b[.:\s]*([A-Z0-9-]{6,30})/i,
  ]);

  // 선박명 (vessel)
  const vessel = findField(t, [
    /Ocean\s+Vessel[.:\s]*([^\n/]{3,40}?)(?:\s*VOY|\s*Voy|\s*\/|\n)/i,
    /Vessel\s+(?:Name)?[.:\s]*([^\n/]{3,40}?)(?:\s*VOY|\s*Voy|\s*\/|\n)/i,
    /Ship\s*Name[.:\s]*([^\n]{3,40})/i,
    /선박명[.:\s]*([^\n]{2,40})/i,
  ]) || findAfterLabel(t, ['Ocean Vessel', 'Vessel Name', 'VESSEL', '선박명']);

  // 항차 (voyage)
  const voyage = findField(t, [
    /Voy(?:age)?\.?\s*(?:No\.?)?[.:\s]*([A-Z0-9]{2,15})/i,
    /항차[.:\s]*([A-Z0-9]{2,15})/i,
    /VOY[.:\s#]*([A-Z0-9]{2,15})/i,
  ]);

  // 선적항 POL
  const pol = findField(t, [
    /Port\s+of\s+Loading[.:\s]*([^\n]{2,40})/i,
    /Place\s+of\s+Receipt[.:\s]*([^\n]{2,40})/i,
    /(?:출발|선적)항[.:\s]*([^\n]{2,40})/i,
    /POL[.:\s]*([^\n]{2,40})/i,
  ]);

  // 양륙항 POD
  const pod = findField(t, [
    /Port\s+of\s+Discharge[.:\s]*([^\n]{2,40})/i,
    /Place\s+of\s+Delivery[.:\s]*([^\n]{2,40})/i,
    /Final\s+Destination[.:\s]*([^\n]{2,40})/i,
    /(?:도착|양륙)항[.:\s]*([^\n]{2,40})/i,
    /POD[.:\s]*([^\n]{2,40})/i,
  ]);

  // On-Board Date (ETD에 사용)
  const etdRaw = findField(t, [
    /(?:Shipped\s+)?On\s+Board(?:\s+Date)?[.:\s]*([^\n]{4,20})/i,
    /On-Board\s+Date[.:\s]*([^\n]{4,20})/i,
    /Date\s+(?:of\s+)?(?:Shipment|Issue)[.:\s]*([^\n]{4,20})/i,
    /선적일[.:\s]*([^\n]{4,20})/i,
    /출항일[.:\s]*([^\n]{4,20})/i,
  ]);
  const etd = parseDate(etdRaw);

  // Gross Weight
  const gwRaw = findField(t, [
    /Gross\s+(?:Weight|Wt\.?)[.:\s]*([\d,]+\.?\d*)\s*(?:KGS?|LBS?)?/i,
    /G\.?W\.?[.:\s]*([\d,]+\.?\d*)\s*(?:KGS?|LBS?)?/i,
    /총?\s*중량[.:\s]*([\d,]+\.?\d*)/i,
  ]);
  const grossWeight = extractNumber(gwRaw);

  // CBM / Measurement
  const cbmRaw = findField(t, [
    /(?:Measurement|Volume|CBM)[.:\s]*([\d,]+\.?\d*)\s*(?:CBM|M3)?/i,
    /용적[.:\s]*([\d,]+\.?\d*)/i,
  ]);
  const cbm = extractNumber(cbmRaw);

  // 컨테이너 번호
  const cntrNos = findContainerNos(t);
  const containerNo = cntrNos[0] || null;

  // 씰 번호
  const sealNos = findSealNos(t);
  const sealNo = sealNos[0] || null;

  return {
    blNo: blNo || null,
    vessel: vessel ? vessel.replace(/\s+/g, ' ').trim() : null,
    voyage: voyage || null,
    pol: pol ? pol.replace(/\s+/g, ' ').trim() : null,
    pod: pod ? pod.replace(/\s+/g, ' ').trim() : null,
    etd,
    grossWeight,
    cbm,
    containerNo,
    sealNo,
    allContainerNos: cntrNos,
    _rawText: t.slice(0, 300), // 디버그용
  };
}

// ── Route Handler ─────────────────────────────────────────────────────────────

async function extractPdfText(buf: Buffer): Promise<string> {
  // serverExternalPackages: ['pdfjs-dist'] 로 인해 node_modules에서 직접 로드
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // worker 파일 경로를 Node.js 모듈 해결 방식으로 찾기
  // createRequire + process.cwd() → standalone 빌드의 node_modules까지 탐색
  const { createRequire } = await import('module');
  const { join } = await import('path');
  let workerSrc = '';
  try {
    const req = createRequire(join(process.cwd(), '_dummy_'));
    const workerPath = req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    workerSrc = `file://${workerPath}`;
  } catch {
    // 탐색 실패 시 경로 직접 구성 (standalone 기준)
    workerSrc = `file://${join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')}`;
  }
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;

  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageText = content.items.map((item: any) => item.str ?? '').join(' ');
    text += pageText + '\n';
  }
  return text;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    const text = await extractPdfText(buf);

    if (!text.trim()) {
      return NextResponse.json({ error: 'PDF에서 텍스트를 추출할 수 없습니다. 스캔 이미지 PDF는 지원되지 않습니다.' }, { status: 422 });
    }

    const result = parseBLText(text);
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    console.error('[parse-bl]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
