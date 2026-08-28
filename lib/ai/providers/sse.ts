/**
 * OpenAI 호환 Chat Completions 스트리밍(SSE)의 표준 프레임 파서.
 * `data: {...}\n\n` 라인을 하나씩 읽어 delta 텍스트만 yield하고, `data: [DONE]`에서 끝낸다.
 * OpenAI 자체뿐 아니라 "OpenAI 호환"을 표방하는 모든 벤더(Cloudflare의 v1 호환 엔드포인트,
 * OpenAI 호환 서버 등)가 동일한 포맷을 쓰므로 이 파서 하나를 공유한다.
 */
export async function* parseOpenAISSEStream(response: Response): AsyncGenerator<string> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // 마지막(미완성) 라인은 다음 청크와 이어붙임

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const delta: string | undefined = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* 파싱 안 되는 프레임(주석 등)은 건너뜀 */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
