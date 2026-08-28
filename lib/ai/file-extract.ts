import JSZip from 'jszip';
import ExcelJS from 'exceljs';

// pdf-parse(pdfjs-dist 내부 의존)가 Node.js 환경에서 DOMMatrix를 요구하므로 폴리필한다.
// 기존 app/api/imports/[id]/parse-doc/route.ts, lib/classify-document.ts와 동일한 패턴.
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

export type ExtractableExt = 'pdf' | 'docx' | 'xlsx' | 'xls' | 'txt' | 'csv';

export const EXTRACTABLE_EXTENSIONS: ExtractableExt[] = ['pdf', 'docx', 'xlsx', 'xls', 'txt', 'csv'];

export interface ExtractResult { text: string; truncated: boolean }

const MAX_TEXT_CHARS = 100_000; // 문서 하나가 지나치게 커도 청킹/임베딩 비용이 무한정 늘지 않도록 상한

function truncate(text: string): ExtractResult {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
}

async function extractPdf(buf: Buffer): Promise<string> {
  // 'pdf-parse/lib/pdf-parse.js'는 v2에서 더 이상 패키지에 존재하지 않는 내부 경로다
  // (기존 app/api/imports/[id]/parse-doc/route.ts, parse-bl/route.ts가 이 경로를 쓰고
  // 있었는데 실제로는 MODULE_NOT_FOUND로 깨져 있었음 — 같은 김에 정식 공개 진입점으로 교체).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText({ lineEnforce: true });
  return result.text;
}

/** mammoth 같은 별도 파서 없이, docx가 zip 안에 word/document.xml(오피스오픈XML)로
 * 텍스트를 담고 있다는 사실을 이용해 태그만 제거한다 — 서식은 잃지만 검색용 텍스트로는 충분. */
async function extractDocx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) return '';
  const xml = await xmlFile.async('string');
  return xml
    .replace(/<w:p[ >]/g, '\n$&') // 문단 경계에서 줄바꿈 보존
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 표 구조를 살려서 "Sheet: X / Row: 헤더=값, 헤더=값" 형태로 변환한다(단순 셀 나열보다
 * 임베딩·검색 품질이 좋음 — 첫 행을 헤더로 간주). */
async function extractXlsx(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const lines: string[] = [];
  wb.eachSheet(sheet => {
    lines.push(`Sheet: ${sheet.name}`);
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => { headers[colNumber] = String(cell.value ?? '').trim(); });
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const parts: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const header = headers[colNumber] || `열${colNumber}`;
        const value = cell.value;
        const text = value && typeof value === 'object' && 'text' in value ? String((value as { text: unknown }).text) : String(value ?? '');
        if (text.trim()) parts.push(`${header}=${text.trim()}`);
      });
      if (parts.length) lines.push(`Row ${rowNumber}: ${parts.join(', ')}`);
    });
  });
  return lines.join('\n');
}

/** 파싱 실패는 여기서 격리한다 — 지원하지 않는/손상된 파일 하나가 인덱싱 전체를
 * 무너뜨리면 안 되므로 항상 null 또는 빈 텍스트로 안전하게 귀결시킨다. */
export async function extractFileText(buf: Buffer, ext: string): Promise<ExtractResult | null> {
  const normalized = ext.toLowerCase().replace(/^\./, '');
  try {
    switch (normalized) {
      case 'pdf': return truncate(await extractPdf(buf));
      case 'docx': return truncate(await extractDocx(buf));
      case 'xlsx': case 'xls': return truncate(await extractXlsx(buf));
      case 'txt': case 'csv': return truncate(buf.toString('utf8'));
      default: return null; // 이미지(OCR 필요)/기타 형식은 이번 단계에서 다루지 않음
    }
  } catch (e) {
    console.error(`[ai/file-extract] ${normalized} 파싱 실패:`, e);
    return null;
  }
}
