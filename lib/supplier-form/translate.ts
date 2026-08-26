import type { Lang } from './field-schema';

/**
 * 자동 번역 어댑터. 현재 프로젝트에는 연결된 번역/LLM API가 없어 항상 null을 반환한다
 * (원문만 저장되고, 한국어 확정값은 내부 담당자가 직접 입력/검토하는 흐름으로 동작).
 *
 * 나중에 번역 API(예: DeepL, Papago, OpenAI 등)를 연결하려면 이 함수 본문만 교체하면 된다 —
 * 호출부(save 라우트)는 이미 원문/한국어값을 분리 저장하는 구조이므로 변경이 필요 없다.
 *
 * 모델명/회사명/인증번호/수치/단위/전압/전류/LED 배열/부품 형명은 절대 번역하지 않는다 —
 * 이 필드들은 field-schema.ts의 preserveOriginal=true 필드이며, 호출부에서 애초에
 * 이 함수를 호출하지 않고 원문을 그대로 한국어값에 복사한다.
 */
export async function translateToKorean(_text: string, _sourceLang: Lang): Promise<string | null> {
  return null;
}
