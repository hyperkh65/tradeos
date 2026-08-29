/**
 * Qdrant REST API 얇은 래퍼. 별도 SDK를 추가하지 않고 fetch만 사용해서,
 * Vector Store를 다른 제품으로 교체하더라도 core(RAG/Indexer)가 이 파일의
 * 함수 시그니처만 구현하면 되게 한다.
 */

export interface QdrantConfig {
  url: string;
  apiKey?: string | null;
  collection: string;
}

export class QdrantError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'QdrantError';
    this.status = status;
  }
}

function headers(cfg: QdrantConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) h['api-key'] = cfg.apiKey;
  return h;
}

const RETRY_DELAYS_MS = [500, 1500, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Qdrant가 배포 직후 아직 기동 중이거나 잠깐 응답이 없는 경우("Qdrant 연결 실패:
 * fetch failed") 바로 영구 실패로 처리하지 않고 지수 백오프로 재시도한다 —
 * 네트워크 레벨 실패(fetch 자체가 throw)와 502/503/504만 재시도 대상이고, 4xx
 * 논리 오류(잘못된 요청/컬렉션 없음 등)는 재시도해도 소용없으므로 즉시 실패시킨다. */
async function req<T>(cfg: QdrantConfig, method: string, path: string, body?: unknown): Promise<T> {
  let lastError: QdrantError | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${cfg.url.replace(/\/$/, '')}${path}`, {
        method, headers: headers(cfg), body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      lastError = new QdrantError(`Qdrant 연결 실패: ${(e as Error).message}`);
      if (attempt < RETRY_DELAYS_MS.length) { await sleep(RETRY_DELAYS_MS[attempt]); continue; }
      throw lastError;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      const err = new QdrantError(json?.status?.error || json?.error || `Qdrant 요청 실패(${res.status})`, res.status);
      if ([502, 503, 504].includes(res.status) && attempt < RETRY_DELAYS_MS.length) {
        lastError = err;
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw err;
    }
    return (await res.json().catch(() => null)) as T;
  }
  throw lastError || new QdrantError('Qdrant 요청 실패');
}

export async function qdrantHealthCheck(cfg: QdrantConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const info = await req<{ title?: string; version?: string }>(cfg, 'GET', '/');
    return { ok: true, message: `연결됨 (Qdrant ${info.version || ''})` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function qdrantGetCollectionInfo(cfg: QdrantConfig): Promise<{
  exists: boolean; pointsCount: number; vectorSize: number | null; status: string | null;
}> {
  try {
    const info = await req<{ result: { points_count: number; status: string; config: { params: { vectors: { size: number } } } } }>(
      cfg, 'GET', `/collections/${encodeURIComponent(cfg.collection)}`,
    );
    return {
      exists: true, pointsCount: info.result.points_count, status: info.result.status,
      vectorSize: info.result.config?.params?.vectors?.size ?? null,
    };
  } catch (e) {
    if (e instanceof QdrantError && e.status === 404) return { exists: false, pointsCount: 0, vectorSize: null, status: null };
    throw e;
  }
}

/** 컬렉션이 없으면 생성하고, 있으면 그대로 둔다(멱등). */
export async function qdrantEnsureCollection(cfg: QdrantConfig, dimensions: number): Promise<void> {
  const info = await qdrantGetCollectionInfo(cfg);
  if (info.exists) return;
  await req(cfg, 'PUT', `/collections/${encodeURIComponent(cfg.collection)}`, {
    vectors: { size: dimensions, distance: 'Cosine' },
  });
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export async function qdrantUpsertPoints(cfg: QdrantConfig, points: QdrantPoint[]): Promise<void> {
  if (points.length === 0) return;
  await req(cfg, 'PUT', `/collections/${encodeURIComponent(cfg.collection)}/points?wait=true`, { points });
}

export async function qdrantDeletePoints(cfg: QdrantConfig, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await req(cfg, 'POST', `/collections/${encodeURIComponent(cfg.collection)}/points/delete?wait=true`, { points: ids });
}

export interface QdrantFilterCondition { key: string; match: { value: string | number | boolean } }
export interface QdrantFilter { must?: QdrantFilterCondition[]; should?: QdrantFilterCondition[] }

export async function qdrantDeleteByFilter(cfg: QdrantConfig, filter: QdrantFilter): Promise<void> {
  await req(cfg, 'POST', `/collections/${encodeURIComponent(cfg.collection)}/points/delete?wait=true`, { filter });
}

export interface QdrantSearchHit { id: string; score: number; payload: Record<string, unknown> }

export async function qdrantSearch(cfg: QdrantConfig, vector: number[], opts?: { limit?: number; filter?: QdrantFilter }): Promise<QdrantSearchHit[]> {
  const result = await req<{ result: QdrantSearchHit[] }>(cfg, 'POST', `/collections/${encodeURIComponent(cfg.collection)}/points/search`, {
    vector, limit: opts?.limit ?? 8, filter: opts?.filter, with_payload: true,
  });
  return result.result;
}
