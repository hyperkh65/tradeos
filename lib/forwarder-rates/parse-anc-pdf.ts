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
  const lines = result.text.split('\n').map((l: string) => l.trim()).filter(Boolean);

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
        const breakdown = lookupBreakdown(pod, containerType) || [];
        const row: ParsedRateRow = {
          pol, pod, containerType, carrier, rateType: rateType || undefined,
          totalAmount: amount, totalCurrency: 'USD', breakdown: breakdown.map(b => ({ ...b })),
          needsReview: breakdown.length === 0,
          reviewNote: breakdown.length === 0 ? '이 노선/컨테이너타입의 국내 부대비용(THC/DOC 등) 이력이 없어 비워뒀습니다 — 직접 입력하세요.' : '국내 부대비용은 최근 견적값을 그대로 이어받았습니다 — 변경됐으면 확인하세요.',
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
