import { getAISettings } from './db';
import type { QdrantConfig } from './vectorstore/qdrant';

/** admin UI에 저장된 값이 우선, 없으면 환경변수를 fallback으로 쓴다(초기 배포 시
 * admin이 아직 설정하지 않았어도 .env로 최소 동작 가능하게 하기 위함). */
export function getQdrantConfig(): QdrantConfig | null {
  const settings = getAISettings();
  const url = settings.qdrantUrl || process.env.QDRANT_URL || null;
  if (!url) return null;
  const apiKey = settings.qdrantApiKey || process.env.QDRANT_API_KEY || null;
  return { url, apiKey, collection: settings.qdrantCollection || 'tradeos_knowledge' };
}
