import { NextRequest, NextResponse } from 'next/server';
import { newId } from '@/lib/db/sqlite';
import type { CargoItem } from '@/types';

export const maxDuration = 60;

// ── 컬럼 키워드 매처 ───────────────────────────────────────────────────────────
const COL_KEYWORDS: Record<string, RegExp> = {
  // 상품 설명 (DESCRIPTION, GOODS 등)
  description: /^desc(?:ription)?$|^goods(?:\s+desc)?$|^commodity|^item\s+desc|품명|제품명?|상품명/i,
  // 품목 코드 (ITEM#, MODEL, PART NO 등) — DESCRIPTION보다 후순위
  itemCode:    /^item\s*[#\.]|^model|^part\s*no|^sku|^style|^ref\s*no|^mfg|^p\/n/i,
  // 수량 — "Q`ty", "Qty.", "Quantity", "Q'TY"
  qty:         /q[\W_]{0,3}ty|quantity|수량|개수|^pcs$|^ea$/i,
  // 총중량
  grossWeight: /g\.?\s*w\.?|gross\s*wt?|총\s*중량|총\s*무게|毛重/i,
  // 순중량
  netWeight:   /n\.?\s*w\.?|net\s*wt?|순\s*중량|净重/i,
  // CBM — "V:(M3)", "CBM", "M3", "Volume"
  cbm:         /cbm|m3|m³|volume|measurement|체적|용적|体积|\bvol\b/i,
  // 공급사
  supplier:    /supplier|vendor|shipper|공급사?|제조사?|manufacturer/i,
  // PO 번호 — "PONO", "PO NO", "ORDER NO"
  poNo:        /po\s*[#.\-]?\s*no|^pono$|^po$|order\s*no|발주번호|po\s*번호|contract/i,
  // 비고
  remark:      /remark|note|memo|비고|설명/i,
  // 상자수
  ctns:        /ctns?|carton|pkgs?|packages?|박스|pallet/i,
};

// 헤더 셀 정규화 — 줄바꿈 공백화만, 괄호는 유지 (CBM의 "(M3)" 인식 필요)
function normalizeHeader(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function matchCol(raw: string): string | null {
  const header = normalizeHeader(raw);
  for (const [key, re] of Object.entries(COL_KEYWORDS)) {
    if (re.test(header)) return key;
  }
  return null;
}

// 셀 값 문자열 추출
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCellStr(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return String(v.result ?? '');
    if ('text' in v) return String(v.text ?? '');
    if ('richText' in v) return (v.richText as { text: string }[]).map(r => r.text).join('');
  }
  return String(v).trim();
}

// 스킵할 행 판별
function isSkipRow(productName: string, allVals: string[]): boolean {
  if (!productName) return true;
  const u = productName.toUpperCase().trim();
  // 합계/Total 행
  if (/^total[\s:]*$|^합계|^소계|^sub[\s-]*total|^grand[\s-]*total/i.test(u)) return true;
  // 원산지
  if (/^country[\s_]*of[\s_]*orig|^원산지|^made[\s_]*in/i.test(u)) return true;
  // 헤더/메타 텍스트
  if (/^packing\s*list|^invoice|^note\s*:|^remark|^shipper|^consignee/i.test(u)) return true;
  // 병합된 회사명 행: 모든 비어있지 않은 값이 동일
  const nonEmpty = allVals.filter(Boolean);
  if (nonEmpty.length >= 3 && new Set(nonEmpty).size === 1) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab) as unknown as Buffer;

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);

    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: '시트 없음' }, { status: 400 });

    // ── 헤더 행 탐색 (점수 기반: 키워드 가장 많이 일치한 행) ─────────────────
    let bestScore = 0;
    let headerRowNum = 1;
    let colMap: Record<string, number> = {};

    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      const candidates: Record<string, number> = {};
      row.eachCell({ includeEmpty: false }, (cell, colNum) => {
        const val = getCellStr(cell.value);
        const matched = matchCol(val);
        // 같은 키는 먼저 나온 컬럼 우선 (단, description은 itemCode보다 우선)
        if (matched) {
          if (matched === 'description' || !(matched in candidates)) {
            candidates[matched] = colNum;
          }
        }
      });
      const score = Object.keys(candidates).length;
      if (score > bestScore) {
        bestScore = score;
        headerRowNum = rowNum;
        colMap = candidates;
      }
    });

    if (bestScore < 2) {
      // 폴백: 1행을 헤더로
      headerRowNum = 1;
      colMap = {};
      ws.getRow(1).eachCell({ includeEmpty: false }, (cell, colNum) => {
        const val = getCellStr(cell.value);
        const matched = matchCol(val);
        if (matched && !(matched in colMap)) colMap[matched] = colNum;
      });
    }

    // description 컬럼이 없으면 itemCode를 product로 사용
    const productCol = colMap.description ?? colMap.itemCode ?? 0;
    const remarkExtraCol = colMap.description && colMap.itemCode ? colMap.itemCode : 0;

    // ── ContainerNo 추출 ─────────────────────────────────────────────────────
    let containerNoCol = 0;
    ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, colNum) => {
      if (/container\s*no|cntr\s*no/i.test(getCellStr(cell.value))) containerNoCol = colNum;
    });
    let containerNo = '';
    if (containerNoCol > 0) {
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum <= headerRowNum || containerNo) return;
        const m = /\b([A-Z]{4}\d{6,7})\b/.exec(getCellStr(row.getCell(containerNoCol).value));
        if (m) containerNo = m[1];
      });
    }

    // ── 데이터 행 파싱 ─────────────────────────────────────────────────────────
    const items: CargoItem[] = [];
    let totalGrossWeight = 0;
    let totalCbm = 0;

    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum <= headerRowNum) return;

      const getCol = (colNum: number): string => colNum ? getCellStr(row.getCell(colNum).value) : '';
      const get = (key: string): string => getCol(colMap[key] ?? 0);

      // 품명: description 우선, 없으면 itemCode. 다중줄 셀은 첫 줄만
      const rawProduct = getCol(productCol);
      const productName = rawProduct.split(/[\r\n]/)[0].trim();

      // 병합행 판별용 전체 컬럼 값
      const allVals: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => { if (c <= 12) allVals.push(getCellStr(cell.value)); });

      if (isSkipRow(productName, allVals)) return;

      // remark: 기존 비고 컬럼, 또는 DESCRIPTION이 품명 컬럼일 때 ITEM# 코드 병기
      const baseRemark = get('remark');
      const extraCode = remarkExtraCol ? getCol(remarkExtraCol).split(/[\r\n]/)[0].trim() : '';
      const remark = baseRemark || extraCode || '';

      const gw  = parseFloat(get('grossWeight').replace(/,/g, '')) || 0;
      const nw  = parseFloat(get('netWeight').replace(/,/g, ''))   || 0;
      const cbm = parseFloat(get('cbm').replace(/,/g, ''))         || 0;
      const qty = parseFloat(get('qty').replace(/,/g, ''))         || undefined;

      totalGrossWeight += gw;
      totalCbm += cbm;

      items.push({
        id: newId(),
        productName,
        supplierName: get('supplier') || undefined,
        poBusinessId: get('poNo') || undefined,
        qty,
        grossWeight: gw || undefined,
        netWeight:   nw || undefined,
        cbm:         cbm || undefined,
        remark:      remark || undefined,
      });
    });

    return NextResponse.json({
      items,
      totalGrossWeight: Math.round(totalGrossWeight * 100) / 100,
      totalCbm:         Math.round(totalCbm * 1000) / 1000,
      headerRow:        headerRowNum,
      detectedColumns:  colMap,
      containerNo:      containerNo || undefined,
    });
  } catch (e) {
    console.error('[parse-packing-list]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
