import type { Lang, NumberedSection, SectionInstance } from './types';
import { defaultTitleFor } from './section-registry';

/**
 * 포함된 장만 골라 순서대로 1부터 장번호를 매긴다 — 순수 함수, DB/IO 없음.
 * 제외된 장은 번호 자체가 존재하지 않게 되므로(건너뛰지 않고 완전히 빠짐), 뒤의 장들은
 * 항상 연속된 번호로 다시 채번된다. approval_doc_sections.chapter_number_cache는 화면
 * 미리보기용일 뿐 이 함수의 입력/출력 어디에도 관여하지 않는다 — 실제 문서 생성 시점에는
 * 매번 이 함수를 다시 호출해 새로 계산한다.
 */
export function computeChapterNumbers(sections: SectionInstance[], lang: Lang): NumberedSection[] {
  return sections
    .filter(s => s.included)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, idx) => ({
      id: s.id,
      sectionType: s.sectionType,
      title: s.customTitle?.trim() || defaultTitleFor(s.sectionType, lang),
      chapterNumber: idx + 1,
    }));
}

/** "장번호. 제목" 형태 — 채번된 결과 하나로 목차/본문 헤딩/페이지번호 검색 마커까지
 * 전부 동일한 문자열을 쓰게 해서 세 곳의 번호가 어긋날 여지를 없앤다. */
export function headingText(section: NumberedSection): string {
  return `${section.chapterNumber}. ${section.title}`;
}
