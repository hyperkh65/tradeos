import type ExcelJS from 'exceljs';

export interface ParsedBreakdownItem { label: string; amount: number; currency: string }
export interface ParsedRateRow {
  pol: string; pod: string; containerType: string; carrier?: string; rateType?: string;
  totalAmount: number; totalCurrency: string; breakdown: ParsedBreakdownItem[];
  needsReview?: boolean; reviewNote?: string;
}

function toNum(text: string): number | null {
  if (!text) return null;
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellText(cell: any): string {
  let v = cell?.value;
  if (v && typeof v === 'object' && 'result' in v) v = v.result;
  if (v && typeof v === 'object' && 'richText' in v) v = v.richText.map((t: { text: string }) => t.text).join('');
  return v === null || v === undefined ? '' : String(v).trim();
}

/** "NINGBO,SHANGHAI~INCHEON(외국계선사)" 같은 노선 표기를 POL(복수 가능)/POD/선사로 쪼갠다. */
function parseLaneCell(text: string): { pols: string[]; pod: string; carrier?: string } | null {
  if (!text.includes('~')) return null;
  const [polPart, podPartRaw] = text.split('~');
  const carrierMatch = podPartRaw.match(/\(([^)]+)\)/);
  const carrier = carrierMatch ? carrierMatch[1].trim() : undefined;
  const pod = podPartRaw.replace(/\([^)]*\)/, '').trim().toUpperCase();
  const pols = polPart.split(/[,/]/).map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!pod || pols.length === 0) return null;
  return { pols, pod, carrier };
}

/** CNC 견적 엑셀(YY년M월운임 시트, 컨테이너타입별 외화/원화 나란히 + TOTAL행 구조)을 파싱한다.
 * 실제 샘플로 검증한 구조: "20'GP"가 등장하는 헤더행을 기준으로 -1행=노선명, +2행부터
 * 항목행(라벨 + 4열씩 [20외화,20원화,40외화,40원화] 반복), "TOTAL" 라벨행에서 종료.
 * TOTAL행 자체는 신뢰하지 않고 항목행을 직접 합산한다 — 이중계산 버그 재발 방지의 핵심
 * (총운임=외화 항목 합계, breakdown=원화 항목만 — 외화 항목을 breakdown에 다시 넣지 않는다). */
export async function parseCncExcel(buf: Buffer): Promise<{ rows: ParsedRateRow[]; warnings: string[]; sheetName: string }> {
  const ExcelJSLib = (await import('exceljs')).default;
  const wb = new ExcelJSLib.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  // "YY년M월운임" 패턴 시트 중 가장 최근 것을 우선 선택(CNC는 매달 새 시트를 이어붙이는 방식).
  const monthSheetRe = /^(\d{2})년\s*(\d{1,2})월\s*운임$/;
  let target: ExcelJS.Worksheet | undefined;
  let bestKey = -1;
  for (const ws of wb.worksheets) {
    const m = ws.name.match(monthSheetRe);
    if (m) {
      const key = Number(m[1]) * 100 + Number(m[2]);
      if (key > bestKey) { bestKey = key; target = ws; }
    }
  }
  if (!target) target = wb.worksheets[wb.worksheets.length - 1];
  const ws = target;
  const maxCol = ws.columnCount;
  // ExcelJS는 ws.getRow(n)/getCell(n)을 현재 범위 밖의 n으로 호출하면 그 행/열을 그
  // 자리에서 새로 만들어버려 ws.rowCount 자체가 늘어난다. 루프 조건에서 ws.rowCount를
  // 매번 다시 읽으면(특히 r+1행을 조회하는 코드가 안에 있으면) 경계 밖 조회 → rowCount
  // 증가 → 루프가 절대 안 끝나는 무한 확장이 실제로 발생했다(OOM으로 서버가 죽음).
  // 시작 전에 한 번만 고정해서 방지한다.
  const maxRow = ws.rowCount;
  const rows: ParsedRateRow[] = [];
  const warnings: string[] = [];

  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const currencyRow = r + 1 <= maxRow ? ws.getRow(r + 1) : null; // "외화"/"원화" 라벨행 — "20'GP"는
    // 외화·원화 두 열에 걸쳐 같은 값이 반복되므로(예: D열=20'GP(외화), E열=20'GP(원화)),
    // 이 행에서 "외화"인 열만 걸러야 노선 블록당 정확히 한 번씩만 잡힌다.
    const gp20Cols: number[] = [];
    if (currencyRow) {
      for (let c = 1; c <= maxCol; c++) {
        const isGp20 = cellText(row.getCell(c)).replace(/['’]/g, "'") === "20'GP";
        const isForeign = cellText(currencyRow.getCell(c)) === '외화';
        if (isGp20 && isForeign) gp20Cols.push(c);
      }
    }
    if (gp20Cols.length === 0) continue;

    const laneRow = ws.getRow(r - 1);
    const itemStart = r + 2; // 헤더행 +1=외화/원화 라벨행, +2부터 항목
    let itemEnd = itemStart;
    for (let rr = itemStart; rr <= maxRow; rr++) {
      const label = cellText(ws.getRow(rr).getCell(2)) || cellText(ws.getRow(rr).getCell(3));
      itemEnd = rr;
      if (label.toUpperCase() === 'TOTAL') break;
    }

    for (const startCol of gp20Cols) {
      const laneText = cellText(laneRow.getCell(startCol));
      const parsed = parseLaneCell(laneText);
      if (!parsed) continue;

      const c20f = startCol, c20k = startCol + 1, c40f = startCol + 2, c40k = startCol + 3;
      const items20: ParsedBreakdownItem[] = [];
      const items40: ParsedBreakdownItem[] = [];
      let sum20 = 0, sum40 = 0;
      for (let rr = itemStart; rr < itemEnd; rr++) {
        const itemRow = ws.getRow(rr);
        // C열이 더 구체적인 항목명(T.H.C/WFG 등)이고 B열은 "Port Charge" 같은 상위 분류라
        // C열을 우선한다(둘이 같은 값일 때도 많아 안전 — 예: O/F,EBS,CRC는 B=C).
        const label = cellText(itemRow.getCell(3)) || cellText(itemRow.getCell(2));
        if (!label) continue;
        const f20 = toNum(cellText(itemRow.getCell(c20f)));
        const k20 = toNum(cellText(itemRow.getCell(c20k)));
        const f40 = toNum(cellText(itemRow.getCell(c40f)));
        const k40 = toNum(cellText(itemRow.getCell(c40k)));
        if (f20) sum20 += f20;
        if (k20) items20.push({ label, amount: k20, currency: 'KRW' });
        if (f40) sum40 += f40;
        if (k40) items40.push({ label, amount: k40, currency: 'KRW' });
      }

      for (const pol of parsed.pols) {
        if (sum20 > 0) rows.push({ pol, pod: parsed.pod, containerType: '20GP', carrier: parsed.carrier, rateType: 'OF_SURCHARGE', totalAmount: sum20, totalCurrency: 'USD', breakdown: items20 });
        if (sum40 > 0) rows.push({ pol, pod: parsed.pod, containerType: '40GP', carrier: parsed.carrier, rateType: 'OF_SURCHARGE', totalAmount: sum40, totalCurrency: 'USD', breakdown: items40 });
      }
    }
  }

  if (rows.length === 0) warnings.push('시트에서 노선 데이터를 찾지 못했습니다 — 형식이 다를 수 있어 수동 확인이 필요합니다.');
  return { rows, warnings, sheetName: ws.name };
}
