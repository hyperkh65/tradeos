/**
 * 문서 구조(문단)를 최대한 보존하는 청킹. 특정 임베딩 모델에 종속된 하드코딩된
 * 청크 크기 대신, 호출자가 모델의 maxContext에서 유도한 예산을 넘겨준다.
 */
export interface Chunk { text: string; index: number }

const CHARS_PER_TOKEN_ESTIMATE = 3; // 한국어 위주 텍스트라 영어 대비 토큰당 글자수가 적음(보수적으로 추정)

export function deriveCharBudget(maxContextTokens: number, reserveRatio = 0.7): number {
  return Math.max(200, Math.floor(maxContextTokens * CHARS_PER_TOKEN_ESTIMATE * reserveRatio));
}

export function chunkText(text: string, opts?: { maxChars?: number; overlapChars?: number }): Chunk[] {
  const maxChars = opts?.maxChars ?? 1200;
  const overlapChars = Math.min(opts?.overlapChars ?? 150, Math.floor(maxChars / 4));
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [{ text: normalized, index: 0 }];

  // 1) 문단(빈 줄) 단위로 먼저 나눈다 — 구조를 최대한 보존.
  const paragraphs = normalized.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (para.length <= maxChars) {
      current = para;
    } else {
      // 2) 문단 하나가 예산을 넘으면 문장 경계(마침표/줄바꿈)로 잘라 채운다.
      const sentences = para.split(/(?<=[.!?。\n])\s+/);
      let buf = '';
      for (const s of sentences) {
        const cand = buf ? `${buf} ${s}` : s;
        if (cand.length <= maxChars) { buf = cand; continue; }
        if (buf) chunks.push(buf);
        buf = s.length <= maxChars ? s : s.slice(0, maxChars); // 극단적으로 긴 단일 문장은 문자 단위로 강제 절단
      }
      current = buf;
    }
  }
  if (current) chunks.push(current);

  // 3) 인접 청크 사이에 약간의 overlap을 넣어 청크 경계에서 문맥이 끊기지 않게 한다.
  const withOverlap: string[] = chunks.map((c, i) => {
    if (i === 0 || overlapChars <= 0) return c;
    const prevTail = chunks[i - 1].slice(-overlapChars);
    return `${prevTail}\n${c}`;
  });

  return withOverlap.map((text, index) => ({ text, index }));
}
