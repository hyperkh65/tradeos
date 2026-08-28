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

async function req<T>(cfg: QdrantConfig, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${cfg.url.replace(/\/$/, '')}${path}`, {
      method, headers: headers(cfg), body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new QdrantError(`Qdrant 연결 실패: ${(e as Error).message}`);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new QdrantError(json?.status?.error || json?.error || `Qdrant 요청 실패(${res.status})`, res.status);
  }
  return json as T;
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
