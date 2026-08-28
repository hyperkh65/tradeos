import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const maxDuration = 30;

// DOMMatrix polyfill (pdfjs-dist requirement)
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
    translate(tx=0, ty=0) { return new (globalThis as any).DOMMatrix([this.a, this.b, this.c, this.d, this.e+tx, this.f+ty]); }
    scale(sx=1, sy=1) { return new (globalThis as any).DOMMatrix([this.a*sx, this.b*sy, this.c*sx, this.d*sy, this.e, this.f]); }
    inverse() { const det=this.a*this.d-this.b*this.c||1; return new (globalThis as any).DOMMatrix([this.d/det,-this.b/det,-this.c/det,this.a/det,(this.c*this.f-this.d*this.e)/det,(this.b*this.e-this.a*this.f)/det]); }
  };
}

const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.join(process.env.UPLOAD_DIR, 'imports')
  : process.env.NODE_ENV === 'production'
    ? '/volume1/web/tradeos/data/uploads/imports'
    : path.join(process.cwd(), 'data/uploads/imports');

function parseNum(s: string): number | undefined {
  const n = parseInt(s.replace(/[,\s]/g, ''), 10);
  return isNaN(n) ? undefined : n;
}

function extractFromText(text: string, docType: string) {
  const result: Record<string, unknown> = {};

  // 신고번호: 12345-26-U123456 형식
  const decMatch = text.match(/(\d{5}-\d{2}-[A-Z]\d{6,})/);
  if (decMatch) result.declarationNo = decMatch[1];

  if (docType === 'clearance_cert' || docType === 'auto') {
    // 수입면장 파싱
    // 과세가격 패턴
    const cifPatterns = [
      /과세가격[^\d]*([\d,]+)/,
      /CIF[^\d]*([\d,]+)/,
      /과\s*세\s*가\s*격[^\d]*([\d,]+)/,
    ];
    for (const p of cifPatterns) {
      const m = text.match(p);
      if (m) { result.customsValue = parseNum(m[1]); break; }
    }

    // 관세액
    const dutyPatterns = [
      /관\s*세[^\d]*([\d,]+)/,
      /세\s*액\s*:\s*관세[^\d]*([\d,]+)/,
    ];
    for (const p of dutyPatterns) {
      const m = text.match(p);
      if (m) { result.duty = parseNum(m[1]); break; }
    }

    // 부가가치세
    const vatPatterns = [
      /부가가치세[^\d]*([\d,]+)/,
      /부\s*가\s*세[^\d]*([\d,]+)/,
      /VAT[^\d]*([\d,]+)/,
    ];
    for (const p of vatPatterns) {
      const m = text.match(p);
      if (m) { result.vat = parseNum(m[1]); break; }
    }

    // 인보이스 금액 (USD/CNY)
    const invPatterns = [
      /INVOICE\s+(?:AMOUNT|VALUE)[^\d]*([\d,.]+)/i,
      /인보이스\s*금액[^\d]*([\d,.]+)/,
    ];
    for (const p of invPatterns) {
      const m = text.match(p);
      if (m) { result.invoiceValue = parseFloat(m[1].replace(/,/g, '')); break; }
    }

    // HS코드
    const hsMatch = text.match(/(\d{4}\.\d{2}(?:\.\d{4})?(?:-\d{4})?)/);
    if (hsMatch) result.hsCode = hsMatch[1];
  }

  if (docType === 'tax_bill' || docType === 'auto') {
    // 납세고지서 파싱
    // 고지세액
    const taxPatterns = [
      /고지세액[^\d]*([\d,]+)/,
      /납\s*부\s*세\s*액[^\d]*([\d,]+)/,
      /총\s*세\s*액[^\d]*([\d,]+)/,
    ];
    for (const p of taxPatterns) {
      const m = text.match(p);
      if (m) { result.totalTax = parseNum(m[1]); break; }
    }

    // 납기일
    const dateMatch = text.match(/납기\s*(?:일)?\s*[:\s]+(\d{4}[-./]\d{2}[-./]\d{2}|\d{4}\d{2}\d{2})/);
    if (dateMatch) {
      let d = dateMatch[1].replace(/[./]/g, '-');
      if (d.length === 8) d = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
      result.taxPaymentDate = d;
    }
  }

  return result;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { filename, docType = 'auto' } = body as { filename: string; docType?: string };

    if (!filename) return NextResponse.json({ error: 'filename 필요' }, { status: 400 });

    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_BASE, id, safeName);
    if (!fs.existsSync(filePath)) return NextResponse.json({ error: '파일 없음' }, { status: 404 });

    const ext = path.extname(safeName).slice(1).toLowerCase();
    if (ext !== 'pdf') return NextResponse.json({ error: 'PDF 파일만 파싱 가능합니다' }, { status: 400 });

    const buf = fs.readFileSync(filePath);

    // pdf-parse v2 — 'pdf-parse/lib/pdf-parse.js'는 이 패키지 버전에 더 이상 존재하지
    // 않는 내부 경로라 항상 MODULE_NOT_FOUND로 죽고 있었다(정식 공개 진입점으로 교체).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText({ lineEnforce: true });
    const text: string = result.text;

    const extracted = extractFromText(text, docType);

    return NextResponse.json({
      data: extracted,
      rawText: text.slice(0, 2000),
      found: Object.keys(extracted).length > 0,
    });
  } catch (e) {
    console.error('[parse-doc]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
