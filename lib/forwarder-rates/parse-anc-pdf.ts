import type { ParsedRateRow, ParsedBreakdownItem } from './parse-cnc-excel';

// pdf-parse(pdfjs-dist 내부 의존)가 Node.js 환경에서 DOMMatrix를 요구하므로 폴리필한다.
// lib/ai/file-extract.ts와 동일한 패턴.
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(init?: number[]) { if (Array.isArray(init) && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    multiply(o: any) {
      const r = new (globalThis as any).DOMMatrix();
      r.a = this.a * o.a + this.b * o.c; r.b = this.a * o.b + this.b * o.d;
      r.c = this.c * o.a + this.d * o.c; r.d = this.c * o.b + this.d * o.d;
      r.e = this.e * o.a + this.f * o.c + o.e; r.f = this.e * o.b + this.f * o.d + o.f;
      return r;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformPoint(p: any) { return { x: (p.x ?? 0) * this.a + (p.y ?? 0) * this.c + this.e, y: (p.x ?? 0) * this.b + (p.y ?? 0) * this.d + this.f }; }
    translate(tx = 0, ty = 0) { return new (globalThis as any).DOMMatrix([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]); }
    scale(sx = 1, sy = 1) { return new (globalThis as any).DOMMatrix([this.a * sx, this.b * sy, this.c * sx, this.d * sy, this.e, this.f]); }
  };
}

/** 한글 항구명 → 이 시스템에서 쓰는 영문 POL/POD 코드. ANC 견적서는 한글 항구명만 쓴다. */
const PORT_MAP: Record<string, string> = {
  '상해': 'SHANGHAI', '상하이': 'SHANGHAI', '닝보': 'NINGBO', '셰코우': 'SHEKOU', '션전': 'SHEKOU',
  '부산': 'BUSAN', '인천': 'INCHEON', '평택': 'PYEONGTAEK',
};
function mapPort(name: string): string {
  const key = name.trim();
  return PORT_MAP[key] || key.toUpperCase();
}

/** "상해/닝보-부산" 같은 표기를 POL(복수)/POD로 쪼갠다(ANC는 '/'로 POL을 나열, '-'로 POD 구분). */
function parseAncLane(text: string): { pols: string[]; pod: string } | null {
  if (!text.includes('-')) return null;
  const idx = text.indexOf('-');
  const polPart = text.slice(0, idx);
  const podPart = text.slice(idx + 1);
  const pols = polPart.split('/').map(s => mapPort(s.trim())).filter(Boolean);
  const pod = mapPort(podPart.trim());
  if (!pod || pols.length === 0) return null;
  return { pols, pod };
}

const RATE_HEADER_RE = /^\*\s*(ALL-IN RATE|O\/F\s*\+\s*SURCHARGE)\s*\*/i;
const RATE_ONLY_RE = /^\$(\d+(?:\.\d+)?)\s+\$(\d+(?:\.\d+)?)\s+(.+)$/;
const LANE_WITH_RATE_RE = /^(.+?-\S+)\s+\$(\d+(?:\.\d+)?)\s+\$(\d+(?:\.\d+)?)\s+(.+)$/;
const SURCHARGE_RE = /^(BAF|CAF|CRS)\s+\$(\d+(?:\.\d+)?)\s+\$(\d+(?:\.\d+)?)\s+/i;

/** §"LCL 및 부대비용" 표 — ANC 견적서 맨 뒷장에 있는 THC/DOC/WHF 등 한국 항구측 고정비용
 * 표(§8과 무관, ocean freight와 별개로 항상 별도 informational breakdown으로만 붙는다).
 * 대부분 "라벨 LCL값 20'값 40'값 단위" 한 줄이지만, WHF만 POD(부산/인천/평택)별로 갈라져
 * 텍스트 추출 시 "라벨+LCL+첫20'값" 한 줄 다음 20'값 2개, 40'값 3개, POD 라벨 3개가
 * 순서대로 이어지는 특이한(열 우선) 배치로 나온다 — 실제 pdf-parse 출력으로 확인한 패턴. */
const BREAKDOWN_TABLE_HEADER_RE = /^LCL\s.*TOTAL$/i;
const BREAKDOWN_ROW_RE = /^(THC|DOC|TSF|PSF|CLN CHG|HDC CHARGE)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/;
const WHF_FIRST_LINE_RE = /^WHF\s+(\S+)\s+(\S+)$/;
const POD_LABEL_LINE_RE = /\(([^)]+)\)\s*$/;

/** "\9,000"(원화 표시가 폰트 매핑상 백슬래시로 깨져 나옴), "$30", "X"/"-"(해당없음) 셋 중
 * 하나를 금액+통화로 해석한다. */
function parseBreakdownAmount(tok: string): { amount: number; currency: string } | null {
  if (tok === 'X' || tok === '-') return null;
  if (tok.startsWith('$')) {
    const n = Number(tok.slice(1).replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? { amount: n, currency: 'USD' } : null;
  }
  const m = tok.match(/^\\?([\d,]+)$/);
  if (m) {
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? { amount: n, currency: 'KRW' } : null;
  }
  return null;
}

function parseAncBreakdownTable(lines: string[], headerIdx: number): Record<string, Record<'20GP' | '40GP', ParsedBreakdownItem[]>> {
  const common20: ParsedBreakdownItem[] = [];
  const common40: ParsedBreakdownItem[] = [];
  const whfByPod: Record<string, { gp20: number; gp40: number }> = {};

  let i = headerIdx + 1;
  while (i < lines.length) {
    const raw = lines[i];
    const whfFirst = raw.match(WHF_FIRST_LINE_RE);
    if (whfFirst) {
      // "WHF <LCL값> <첫 20'값>" 다음 2줄이 나머지 20'값, 다음 3줄이 40'값, 다음 3줄이 POD 라벨.
      const v20 = [whfFirst[2], lines[i + 1], lines[i + 2]].map(t => parseBreakdownAmount(t));
      const v40 = [lines[i + 3], lines[i + 4], lines[i + 5]].map(t => parseBreakdownAmount(t));
      const pods = [lines[i + 6], lines[i + 7], lines[i + 8]].map(l => {
        const m = l.match(POD_LABEL_LINE_RE);
        return m ? mapPort(m[1]) : null;
      });
      for (let k = 0; k < 3; k++) {
        const pod = pods[k];
        if (!pod) continue;
        if (v20[k]) whfByPod[pod] = { ...(whfByPod[pod] || { gp20: 0, gp40: 0 }), gp20: v20[k]!.amount };
        if (v40[k]) whfByPod[pod] = { ...(whfByPod[pod] || { gp20: 0, gp40: 0 }), gp40: v40[k]!.amount };
      }
      i += 9;
      continue;
    }
    const m = raw.match(BREAKDOWN_ROW_RE);
    if (m) {
      const [, label, , v20tok, v40tok] = m;
      const a20 = parseBreakdownAmount(v20tok);
      const a40 = parseBreakdownAmount(v40tok);
      if (a20) common20.push({ label, amount: a20.amount, currency: a20.currency });
      if (a40) common40.push({ label, amount: a40.amount, currency: a40.currency });
    }
    // 매칭 안 되는 줄(O/FRT, CFS, 셔틀료 — LCL 전용이라 20GP/40GP 컨테이너 운임과 무관, 페이지 각주 등)은 무시.
    i++;
  }

  const byPod: Record<string, Record<'20GP' | '40GP', ParsedBreakdownItem[]>> = {};
  const pods = new Set([...Object.keys(whfByPod)]);
  for (const pod of pods) {
    const whf = whfByPod[pod];
    byPod[pod] = {
      '20GP': [...common20, ...(whf?.gp20 ? [{ label: 'WHF', amount: whf.gp20, currency: 'KRW' }] : [])],
      '40GP': [...common40, ...(whf?.gp40 ? [{ label: 'WHF', amount: whf.gp40, currency: 'KRW' }] : [])],
    };
  }
  return byPod;
}

/** 최근 견적(같은 포워더+POD+컨테이너타입)의 원화 항목(THC/DOC/WHF 등 국내부대비용)을
 * 그대로 이어받기 위한 조회 함수 — 호출부(라우트)에서 DB를 조회해 넘겨준다. ANC의
 * "LCL 및 부대비용" 표는 PDF 텍스트 추출로는 표 구조가 깨져서(다열 병합) 신뢰도 있게
 * 자동파싱하기 어렵고, 실제로 이 항목들은 달마다 거의 안 바뀌는 고정 표라 최근 값을
 * 이어받는 편이 텍스트 재구성보다 정확하다. */
export type BreakdownLookup = (pod: string, containerType: string) => ParsedBreakdownItem[] | null;

export async function parseAncPdf(buf: Buffer, lookupBreakdown: BreakdownLookup): Promise<{ rows: ParsedRateRow[]; warnings: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText({ lineEnforce: true });
  const allLines = result.text.split('\n').map((l: string) => l.trim()).filter(Boolean);

  // "LCL 및 부대비용" 표(맨 뒷장)가 있으면 그 안의 THC/DOC/WHF 등을 직접 파싱해 우선 쓰고,
  // 이 표를 rate 파싱 루프에 섞이지 않도록 잘라낸다.
  const breakdownHeaderIdx = allLines.findIndex((l: string) => BREAKDOWN_TABLE_HEADER_RE.test(l));
  const pdfBreakdown = breakdownHeaderIdx >= 0 ? parseAncBreakdownTable(allLines, breakdownHeaderIdx) : null;
  const lines = breakdownHeaderIdx >= 0 ? allLines.slice(0, breakdownHeaderIdx) : allLines;

  const rows: ParsedRateRow[] = [];
  const warnings: string[] = [];

  let rateType: 'ALL_IN' | 'OF_SURCHARGE' | null = null;
  let currentLane: { pols: string[]; pod: string } | null = null;
  // 이번 rateType 구간에서 나온 행들 — OF_SURCHARGE 구간 끝의 BAF/CAF/CRS를 소급 적용하기 위해 버퍼링
  let groupRows: ParsedRateRow[] = [];

  const emit = (pols: string[], pod: string, carrier: string, gp20: number, gp40: number) => {
    for (const pol of pols) {
      for (const [containerType, amount] of [['20GP', gp20], ['40GP', gp40]] as const) {
        if (!amount) continue;
        const fromPdf = pdfBreakdown?.[pod]?.[containerType];
        const breakdown = fromPdf && fromPdf.length > 0 ? fromPdf : (lookupBreakdown(pod, containerType) || []);
        const row: ParsedRateRow = {
          pol, pod, containerType, carrier, rateType: rateType || undefined,
          totalAmount: amount, totalCurrency: 'USD', breakdown: breakdown.map(b => ({ ...b })),
          needsReview: breakdown.length === 0,
          reviewNote: breakdown.length === 0
            ? '이 노선/컨테이너타입의 국내 부대비용(THC/DOC 등) 이력이 없어 비워뒀습니다 — 직접 입력하세요.'
            : (fromPdf && fromPdf.length > 0
              ? '이 견적서의 "LCL 및 부대비용" 표에서 직접 읽어왔습니다 — 금액이 맞는지 확인하세요.'
              : '국내 부대비용은 최근 견적값을 그대로 이어받았습니다 — 변경됐으면 확인하세요.'),
        };
        rows.push(row);
        groupRows.push(row);
      }
    }
  };

  for (const raw of lines) {
    if (RATE_HEADER_RE.test(raw)) {
      const m = raw.match(RATE_HEADER_RE)!;
      rateType = /ALL-IN/i.test(m[1]) ? 'ALL_IN' : 'OF_SURCHARGE';
      currentLane = null;
      groupRows = [];
      continue;
    }
    if (!rateType) continue; // 본문 시작 전 안내문 라인은 건너뜀

    const surchargeMatch = raw.match(SURCHARGE_RE);
    if (surchargeMatch) {
      const [, label, v20, v40] = surchargeMatch;
      const n20 = Number(v20), n40 = Number(v40);
      for (const r of groupRows) {
        if (r.containerType === '20GP' && n20) { r.totalAmount += n20; r.breakdown.push({ label: label.toUpperCase(), amount: n20, currency: 'USD' }); }
        if (r.containerType === '40GP' && n40) { r.totalAmount += n40; r.breakdown.push({ label: label.toUpperCase(), amount: n40, currency: 'USD' }); }
      }
      continue;
    }

    const laneWithRate = raw.match(LANE_WITH_RATE_RE);
    if (laneWithRate) {
      const [, laneText, v20, v40, carrier] = laneWithRate;
      const lane = parseAncLane(laneText);
      if (lane) emit(lane.pols, lane.pod, carrier.trim(), Number(v20), Number(v40));
      currentLane = null;
      continue;
    }

    const rateOnly = raw.match(RATE_ONLY_RE);
    if (rateOnly) {
      const [, v20, v40, carrier] = rateOnly;
      if (currentLane) emit(currentLane.pols, currentLane.pod, carrier.trim(), Number(v20), Number(v40));
      continue;
    }

    // 그 외: "노선명"만 있는 줄(다음 줄부터 $레이트가 이어짐)
    const lane = parseAncLane(raw);
    if (lane) { currentLane = lane; continue; }
    // 매칭 안 되는 줄(안내문 등)은 조용히 무시 — LCL/부대비용 표, 각주 등
  }

  if (rows.length === 0) warnings.push('PDF에서 노선 운임을 찾지 못했습니다 — 형식이 다를 수 있어 수동 확인이 필요합니다.');
  return { rows, warnings };
}
