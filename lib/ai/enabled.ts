import { getAISettings } from './db';

/**
 * 서버 강제 비활성화(env AI_ENABLED=false)는 admin DB 설정보다 항상 우선한다.
 * 배포 환경에서 문제가 생겼을 때 DB를 건드리지 않고 즉시 AI 기능 전체를 끌 수 있어야 하기 때문.
 */
export function isAIEnabled(): boolean {
  if (process.env.AI_ENABLED === 'false') return false;
  return getAISettings().enabled;
}
