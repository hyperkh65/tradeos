import fs from 'fs';
import path from 'path';
import { buildApprovalDocx, type BrandOptions, type TemplateOptions } from './docx-build';
import { convertDocxToPdf, withTempDir } from './libreoffice-convert';
import { extractPageNumbers } from './pagination';
import { computeChapterNumbers } from './numbering';
import type { DocProjectMeta, Lang, SectionContent, SectionInstance, TocPageMap } from './types';
import './pdfjs-polyfill';

export interface GenerateResult {
  docxBuffer: Buffer;
  pdfBuffer: Buffer | null;
  pageCount: number | null;
  tocPageMap: TocPageMap;
}

/**
 * 요청서 §10~11의 핵심 요구사항("목차 페이지번호는 최종 렌더링 결과 기준으로 확정")을
 * 만족시키는 2-pass 파이프라인:
 *   1차 DOCX 생성(페이지번호 자리표시자) → LibreOffice로 PDF 변환 → 실제 페이지번호 추출
 *   → 2차 DOCX 생성(실제 번호로 목차 확정) → 최종 PDF 변환
 *
 * docverify 컨테이너를 쓸 수 없어 PDF 변환이 실패하면, DOCX만이라도 내려받을 수 있도록
 * pdfBuffer=null / pageCount=null / tocPageMap={}로 degraded 반환한다(생성 자체를 막지
 * 않음) — 다만 이 경우 목차 페이지번호가 비어있는 상태이므로 호출부(내부 화면)가 사용자
 * 에게 "PDF 변환 서버 연결 실패로 목차 페이지번호가 채워지지 않았습니다"를 분명히 안내
 * 해야 한다.
 */
export async function generateApprovalDocument(params: {
  meta: DocProjectMeta;
  docTitle: string;
  sections: SectionInstance[];
  contents: SectionContent[];
  lang: Lang;
  brand?: BrandOptions;
  template?: TemplateOptions;
}): Promise<GenerateResult> {
  const numbered = computeChapterNumbers(params.sections, params.lang);
  if (numbered.length === 0) {
    throw new Error('[approval-doc] 포함된 섹션이 하나도 없습니다.');
  }

  return withTempDir('approval-doc-', async (dir) => {
    // ── Pass 1 ──────────────────────────────────────────────────────────────
    const pass1Docx = await buildApprovalDocx({
      meta: params.meta,
      docTitle: params.docTitle,
      sections: numbered,
      contents: params.contents,
      brand: params.brand,
      template: params.template,
    });
    const pass1Path = path.join(dir, 'pass1.docx');
    fs.writeFileSync(pass1Path, pass1Docx);

    const pass1Pdf = await convertDocxToPdf(pass1Path);
    if (!pass1Pdf) {
      return { docxBuffer: pass1Docx, pdfBuffer: null, pageCount: null, tocPageMap: {} };
    }

    const tocPageMap = await extractPageNumbers(pass1Pdf, numbered);

    // ── Pass 2 ──────────────────────────────────────────────────────────────
    const pass2Docx = await buildApprovalDocx({
      meta: params.meta,
      docTitle: params.docTitle,
      sections: numbered,
      contents: params.contents,
      tocPageNumbers: tocPageMap,
      brand: params.brand,
      template: params.template,
    });
    const pass2Path = path.join(dir, 'pass2.docx');
    fs.writeFileSync(pass2Path, pass2Docx);

    const pass2Pdf = await convertDocxToPdf(pass2Path);
    const pageCount = pass2Pdf ? await countPdfPages(pass2Pdf) : null;

    return { docxBuffer: pass2Docx, pdfBuffer: pass2Pdf, pageCount, tocPageMap };
  });
}

async function countPdfPages(pdfBuffer: Buffer): Promise<number> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  return doc.numPages;
}
