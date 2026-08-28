import type { User } from '@/types';
import { isAIEnabled } from './enabled';
import { getAISettings, countUserMessagesInLastHour } from './db';

/** /api/ai/chat와 /api/ai/chat/stream이 공유하는 사전 검사 — 기능 꺼짐/요청 한도 초과를
 * 두 라우트에서 같은 방식으로 판단하게 한 곳에 모아둔다. */
export function checkChatGate(user: User): { ok: true } | { ok: false; status: number; error: string } {
  if (!isAIEnabled()) return { ok: false, status: 403, error: 'AI 도우미를 사용할 수 없습니다.' };
  const settings = getAISettings();
  const used = countUserMessagesInLastHour(user.id);
  if (used >= settings.rateLimitPerUserPerHour) {
    return { ok: false, status: 429, error: `요청이 너무 많습니다. 시간당 ${settings.rateLimitPerUserPerHour}회까지 사용할 수 있어요. 잠시 후 다시 시도해 주세요.` };
  }
  return { ok: true };
}
