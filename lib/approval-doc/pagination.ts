import type { NumberedSection, TocPageMap } from './types';
import { headingText } from './numbering';
import { BODY_START_MARKER } from './docx-build';
import './pdfjs-polyfill';

/**
 * 1차 생성된 PDF에서 각 장의 실제 시작 페이지번호를 확정한다.
 *
 * [Phase 0 스파이크 검증 결과] 처음 설계는 "Heading1 스타일 → LibreOffice가 PDF 북마크
 * 생성 → pdfjs-dist getOutline()"이었으나, 실제로 LibreOffice headless 변환은 북마크를
 * 생성하지 않았다(ExportBookmarks 필터를 줘도 동일). 대신 페이지별 텍스트 추출은 한글·
 * 중문 모두 깨짐 없이 정상 동작함을 확인했으므로, 아웃라인이 아니라 "페이지별 텍스트에서
 * 장 제목 문자열을 검색"하는 방식을 채택했다.
 *
 * [실제 통합 테스트에서 발견/수정된 버그] 목차 자체에도 "장번호. 제목"과 동일한 문자열이
 * 그대로 들어가므로, 전체 페이지에서 단순 검색하면 본문이 아니라 목차 페이지를 "그 장이
 * 시작하는 페이지"로 잘못 찾는다(실제로 3개 장이 전부 목차가 있는 페이지로 오검출됨).
 * 그래서 본문 시작 직전에 심어둔 BODY_START_MARKER의 페이지를 먼저 찾고, 그 이후 페이지
 * 에서만 장 제목을 검색하도록 검색 범위를 제한해 해결했다.
 */
export async function extractPageNumbers(pdfBuffer: Buffer, sections: NumberedSection[]): Promise<TocPageMap> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // items 사이에 공백을 넣어 이어붙인다 — 줄바꿈 위치의 단어가 붙어버려 검색에 실패하는
    // 것을 방지 (원본 텍스트의 정확한 서식 재현이 목적이 아니라 "이 페이지에 이 문자열이
    // 있는가"만 판별하면 되므로 과도한 공백은 문제되지 않는다).
    pageTexts.push(content.items.map((it: any) => ('str' in it ? it.str : '')).join(' '));
  }

  const bodyStartPage = pageTexts.findIndex(t => t.includes(BODY_START_MARKER));
  if (bodyStartPage === -1) {
    throw new Error('[approval-doc/pagination] 본문 시작 마커를 PDF에서 찾지 못했습니다 — docx-build.ts의 마커 삽입 로직을 확인하세요.');
  }

  const result: TocPageMap = {};
  const notFound: string[] = [];
  for (const section of sections) {
    const needle = headingText(section);
    const relativeIndex = pageTexts.slice(bodyStartPage).findIndex(t => t.includes(needle));
    if (relativeIndex === -1) {
      notFound.push(needle);
      continue;
    }
    result[section.id] = bodyStartPage + relativeIndex + 1; // 1-based
  }

  if (notFound.length > 0) {
    // 목차에 페이지번호를 못 채운 장이 있다는 뜻 — 조용히 넘어가지 않고 호출부가 이 예외를
    // 보고 생성 실패로 처리하게 한다(요청서 §7 "필수 기본정보가 누락된 경우 오류로 표시"와
    // 같은 원칙: 추정치를 채워넣지 않는다).
    throw new Error(`[approval-doc/pagination] 다음 장의 페이지번호를 PDF에서 찾지 못했습니다: ${notFound.join(', ')}`);
  }

  return result;
}
