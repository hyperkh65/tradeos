import { getDb, newId, now } from '@/lib/db/sqlite';
import { encryptPassword, decryptPassword } from '@/lib/mail/crypto';
import type { AIProviderType, ProviderHealthStatus } from './types';

export interface AIProviderRow {
  id: string;
  name: string;
  providerType: AIProviderType;
  enabled: boolean;
  priority: number;
  accountId: string | null;
  apiToken: string | null; // 복호화된 평문 — DB에는 절대 이 형태로 저장하지 않음
  baseUrl: string | null;
  chatModel: string | null;
  embeddingModel: string | null;
  supportsChat: boolean;
  supportsEmbedding: boolean;
  status: ProviderHealthStatus;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  cooldownUntil: string | null;
  lastError: string | null;
  dailyUsageEstimate: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  id: string; name: string; provider_type: string; enabled: number; priority: number;
  account_id: string | null; api_token_encrypted: string | null; base_url: string | null;
  chat_model: string | null; embedding_model: string | null;
  supports_chat: number; supports_embedding: number; status: string;
  last_success_at: string | null; last_failure_at: string | null; failure_count: number;
  cooldown_until: string | null; last_error: string | null; daily_usage_estimate: number;
  created_by: string | null; created_by_name: string | null; created_at: string; updated_at: string;
}

function rowToProvider(r: DbRow): AIProviderRow {
  return {
    id: r.id, name: r.name, providerType: r.provider_type as AIProviderType,
    enabled: !!r.enabled, priority: r.priority, accountId: r.account_id,
    apiToken: r.api_token_encrypted ? decryptPassword(r.api_token_encrypted) : null,
    baseUrl: r.base_url, chatModel: r.chat_model, embeddingModel: r.embedding_model,
    supportsChat: !!r.supports_chat, supportsEmbedding: !!r.supports_embedding,
    status: r.status as ProviderHealthStatus,
    lastSuccessAt: r.last_success_at, lastFailureAt: r.last_failure_at,
    failureCount: r.failure_count, cooldownUntil: r.cooldown_until, lastError: r.last_error,
    dailyUsageEstimate: r.daily_usage_estimate,
    createdBy: r.created_by, createdByName: r.created_by_name,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function listProviders(): AIProviderRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM ai_providers ORDER BY priority ASC, created_at ASC`).all() as DbRow[];
  return rows.map(rowToProvider);
}

export function listActiveProvidersOrderedByPriority(): AIProviderRow[] {
  return listProviders().filter(p => p.enabled);
}

export function getProvider(id: string): AIProviderRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM ai_providers WHERE id=?`).get(id) as DbRow | undefined;
  return row ? rowToProvider(row) : null;
}

export interface CreateProviderInput {
  name: string; providerType: AIProviderType; enabled?: boolean; priority?: number;
  accountId?: string | null; apiToken?: string | null; baseUrl?: string | null;
  chatModel?: string | null; embeddingModel?: string | null;
  supportsChat?: boolean; supportsEmbedding?: boolean;
  createdBy?: string; createdByName?: string;
}

export function createProvider(input: CreateProviderInput): AIProviderRow {
  const db = getDb();
  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO ai_providers
    (id, name, provider_type, enabled, priority, account_id, api_token_encrypted, base_url,
     chat_model, embedding_model, supports_chat, supports_embedding, status,
     failure_count, daily_usage_estimate, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'healthy', 0, 0, ?,?,?,?)`
  ).run(
    id, input.name, input.providerType, input.enabled === false ? 0 : 1, input.priority ?? 100,
    input.accountId || null, input.apiToken ? encryptPassword(input.apiToken) : null, input.baseUrl || null,
    input.chatModel || null, input.embeddingModel || null,
    input.supportsChat === false ? 0 : 1, input.supportsEmbedding ? 1 : 0,
    input.createdBy || null, input.createdByName || null, ts, ts,
  );
  return getProvider(id)!;
}

export interface UpdateProviderInput extends Partial<CreateProviderInput> {
  /** true면 apiToken을 비운다(연결 해제); undefined면 기존 값 유지; 문자열이면 새 값으로 암호화 */
  clearApiToken?: boolean;
}

export function updateProvider(id: string, input: UpdateProviderInput): AIProviderRow | null {
  const existing = getProvider(id);
  if (!existing) return null;
  const db = getDb();
  const ts = now();
  const apiTokenEncrypted = input.clearApiToken
    ? null
    : (input.apiToken !== undefined ? (input.apiToken ? encryptPassword(input.apiToken) : null) : (existing.apiToken ? encryptPassword(existing.apiToken) : null));
  db.prepare(`UPDATE ai_providers SET
      name=?, provider_type=?, enabled=?, priority=?, account_id=?, api_token_encrypted=?,
      base_url=?, chat_model=?, embedding_model=?, supports_chat=?, supports_embedding=?, updated_at=?
    WHERE id=?`
  ).run(
    input.name ?? existing.name,
    input.providerType ?? existing.providerType,
    input.enabled === undefined ? (existing.enabled ? 1 : 0) : (input.enabled ? 1 : 0),
    input.priority ?? existing.priority,
    input.accountId !== undefined ? input.accountId : existing.accountId,
    apiTokenEncrypted,
    input.baseUrl !== undefined ? input.baseUrl : existing.baseUrl,
    input.chatModel !== undefined ? input.chatModel : existing.chatModel,
    input.embeddingModel !== undefined ? input.embeddingModel : existing.embeddingModel,
    input.supportsChat === undefined ? (existing.supportsChat ? 1 : 0) : (input.supportsChat ? 1 : 0),
    input.supportsEmbedding === undefined ? (existing.supportsEmbedding ? 1 : 0) : (input.supportsEmbedding ? 1 : 0),
    ts, id,
  );
  return getProvider(id);
}

export function deleteProvider(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM ai_providers WHERE id=?`).run(id);
}

export function reorderProviders(orderedIds: string[]): void {
  const db = getDb();
  const ts = now();
  const stmt = db.prepare(`UPDATE ai_providers SET priority=?, updated_at=? WHERE id=?`);
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => stmt.run((idx + 1) * 10, ts, id));
  });
  tx();
}

/** 성공/실패에 따라 헬스 상태를 갱신한다. 재시도 가능한 오류는 지수백오프 쿨다운,
 * 설정 오류(잘못된 토큰/모델 등)는 재시도해도 소용없으므로 'error'로 고정해 둔다. */
export function recordProviderSuccess(id: string): void {
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE ai_providers SET status='healthy', last_success_at=?, failure_count=0, cooldown_until=NULL, last_error=NULL, updated_at=? WHERE id=?`)
    .run(ts, ts, id);
}

export function recordProviderFailure(id: string, opts: { retryable: boolean; message: string }): void {
  const db = getDb();
  const ts = now();
  const existing = getProvider(id);
  const failureCount = (existing?.failureCount || 0) + 1;
  if (opts.retryable) {
    const backoffMs = Math.min(2 ** failureCount * 30_000, 30 * 60_000);
    const cooldownUntil = new Date(Date.now() + backoffMs).toISOString();
    db.prepare(`UPDATE ai_providers SET status='cooldown', last_failure_at=?, failure_count=?, cooldown_until=?, last_error=?, updated_at=? WHERE id=?`)
      .run(ts, failureCount, cooldownUntil, opts.message, ts, id);
  } else {
    db.prepare(`UPDATE ai_providers SET status='error', last_failure_at=?, failure_count=?, cooldown_until=NULL, last_error=?, updated_at=? WHERE id=?`)
      .run(ts, failureCount, opts.message, ts, id);
  }
}

export interface AISettingsRow {
  id: string;
  enabled: boolean;
  defaultChatProviderId: string | null;
  defaultEmbeddingProviderId: string | null;
  rateLimitPerUserPerHour: number;
  searchTopK: number;
  qdrantUrl: string | null;
  qdrantApiKey: string | null;
  qdrantCollection: string;
  rerankerModel: string;
  relevanceThreshold: number;
  rerankThreshold: number;
  updatedAt: string;
  updatedBy: string | null;
}

export function getAISettings(): AISettingsRow {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM ai_settings WHERE id='default'`).get() as Record<string, unknown> | undefined;
  if (!row) {
    const ts = now();
    db.prepare(`INSERT INTO ai_settings (id, enabled, updated_at) VALUES ('default', 0, ?)`).run(ts);
    return getAISettings();
  }
  return {
    id: 'default',
    enabled: !!row.enabled,
    defaultChatProviderId: row.default_chat_provider_id as string | null,
    defaultEmbeddingProviderId: row.default_embedding_provider_id as string | null,
    rateLimitPerUserPerHour: row.rate_limit_per_user_per_hour as number,
    searchTopK: row.search_top_k as number,
    qdrantUrl: row.qdrant_url as string | null,
    qdrantApiKey: row.qdrant_api_key_encrypted ? decryptPassword(row.qdrant_api_key_encrypted as string) : null,
    qdrantCollection: row.qdrant_collection as string,
    rerankerModel: (row.reranker_model as string) || '@cf/baai/bge-reranker-base',
    relevanceThreshold: (row.relevance_threshold as number) ?? 0.5,
    rerankThreshold: (row.rerank_threshold as number) ?? 0.3,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string | null,
  };
}

export function updateAISettings(input: Partial<{
  enabled: boolean; defaultChatProviderId: string | null; defaultEmbeddingProviderId: string | null;
  rateLimitPerUserPerHour: number; searchTopK: number;
  qdrantUrl: string | null; qdrantApiKey: string | null; qdrantCollection: string;
  rerankerModel: string; relevanceThreshold: number; rerankThreshold: number;
  updatedBy: string;
}>): AISettingsRow {
  const existing = getAISettings();
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE ai_settings SET
      enabled=?, default_chat_provider_id=?, default_embedding_provider_id=?,
      rate_limit_per_user_per_hour=?, search_top_k=?, qdrant_url=?, qdrant_api_key_encrypted=?,
      qdrant_collection=?, reranker_model=?, relevance_threshold=?, rerank_threshold=?, updated_at=?, updated_by=?
    WHERE id='default'`
  ).run(
    input.enabled === undefined ? (existing.enabled ? 1 : 0) : (input.enabled ? 1 : 0),
    input.defaultChatProviderId !== undefined ? input.defaultChatProviderId : existing.defaultChatProviderId,
    input.defaultEmbeddingProviderId !== undefined ? input.defaultEmbeddingProviderId : existing.defaultEmbeddingProviderId,
    input.rateLimitPerUserPerHour ?? existing.rateLimitPerUserPerHour,
    input.searchTopK ?? existing.searchTopK,
    input.qdrantUrl !== undefined ? input.qdrantUrl : existing.qdrantUrl,
    input.qdrantApiKey !== undefined ? (input.qdrantApiKey ? encryptPassword(input.qdrantApiKey) : null) : (existing.qdrantApiKey ? encryptPassword(existing.qdrantApiKey) : null),
    input.qdrantCollection ?? existing.qdrantCollection,
    input.rerankerModel ?? existing.rerankerModel,
    input.relevanceThreshold ?? existing.relevanceThreshold,
    input.rerankThreshold ?? existing.rerankThreshold,
    ts, input.updatedBy || null,
  );
  return getAISettings();
}

export interface VectorCollectionRow {
  id: string; collectionName: string; embeddingProvider: string; embeddingModel: string;
  embeddingDimension: number; embeddingVersion: string; status: 'building' | 'active' | 'legacy' | 'failed';
  createdAt: string; updatedAt: string;
}

function rowToVectorCollection(r: Record<string, unknown>): VectorCollectionRow {
  return {
    id: r.id as string, collectionName: r.collection_name as string, embeddingProvider: r.embedding_provider as string,
    embeddingModel: r.embedding_model as string, embeddingDimension: r.embedding_dimension as number,
    embeddingVersion: r.embedding_version as string, status: r.status as VectorCollectionRow['status'],
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function getActiveVectorCollection(): VectorCollectionRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM ai_vector_collections WHERE status='active' ORDER BY created_at DESC LIMIT 1`).get() as Record<string, unknown> | undefined;
  return row ? rowToVectorCollection(row) : null;
}

export function listVectorCollections(): VectorCollectionRow[] {
  const db = getDb();
  return (db.prepare(`SELECT * FROM ai_vector_collections ORDER BY created_at DESC`).all() as Record<string, unknown>[]).map(rowToVectorCollection);
}

export function getVectorCollection(id: string): VectorCollectionRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM ai_vector_collections WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToVectorCollection(row) : null;
}

export function createVectorCollection(input: {
  collectionName: string; embeddingProvider: string; embeddingModel: string;
  embeddingDimension: number; embeddingVersion: string; status?: VectorCollectionRow['status'];
}): VectorCollectionRow {
  const db = getDb();
  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO ai_vector_collections
    (id, collection_name, embedding_provider, embedding_model, embedding_dimension, embedding_version, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, input.collectionName, input.embeddingProvider, input.embeddingModel, input.embeddingDimension, input.embeddingVersion, input.status || 'building', ts, ts);
  return getVectorCollection(id)!;
}

export function setVectorCollectionStatus(id: string, status: VectorCollectionRow['status']): void {
  const db = getDb();
  db.prepare(`UPDATE ai_vector_collections SET status=?, updated_at=? WHERE id=?`).run(status, now(), id);
}

/** 마이그레이션을 취소/포기할 때 해당 building 컬렉션에 남은 잡을 전부 지운다 —
 * 이미 완료된 잡도 포함해서 지운다(잘못된 모델로 만들어진 컬렉션이면 completed 표시된
 * 벡터도 같이 버려지는 대상이라 재사용하면 안 되므로, 다음 마이그레이션이 새 컬렉션에
 * 대해 처음부터 다시 인덱싱하게 한다). */
export function deleteJobsForCollection(targetCollectionId: string): number {
  const db = getDb();
  const result = db.prepare(`DELETE FROM ai_index_jobs WHERE target_collection_id=?`).run(targetCollectionId);
  return result.changes;
}

/** 새 컬렉션(v2)이 완전히 인덱싱된 뒤에만 호출한다 — 이전 active를 legacy로,
 * 대상을 active로 바꾸는 것을 한 트랜잭션으로 묶어 "일부만 전환됨" 상태가 생기지 않게 한다. */
export function activateVectorCollection(id: string): void {
  const db = getDb();
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE ai_vector_collections SET status='legacy', updated_at=? WHERE status='active' AND id<>?`).run(ts, id);
    db.prepare(`UPDATE ai_vector_collections SET status='active', updated_at=? WHERE id=?`).run(ts, id);
  });
  tx();
}

export type PromptKey = 'base' | 'rag_answer' | 'draft_writing' | 'tool_selection';

export function getPromptOverride(key: PromptKey): string | null {
  const db = getDb();
  const row = db.prepare(`SELECT custom_value FROM ai_prompt_settings WHERE prompt_key=?`).get(key) as { custom_value: string | null } | undefined;
  return row?.custom_value ?? null;
}

export function listPromptOverrides(): Record<PromptKey, string | null> {
  const db = getDb();
  const rows = db.prepare(`SELECT prompt_key, custom_value FROM ai_prompt_settings`).all() as { prompt_key: PromptKey; custom_value: string | null }[];
  const out: Record<PromptKey, string | null> = { base: null, rag_answer: null, draft_writing: null, tool_selection: null };
  for (const r of rows) out[r.prompt_key] = r.custom_value;
  return out;
}

export function setPromptOverride(key: PromptKey, value: string | null, updatedBy?: string): void {
  const db = getDb();
  const ts = now();
  db.prepare(`INSERT INTO ai_prompt_settings (prompt_key, custom_value, updated_at, updated_by)
    VALUES (?,?,?,?)
    ON CONFLICT(prompt_key) DO UPDATE SET custom_value=excluded.custom_value, updated_at=excluded.updated_at, updated_by=excluded.updated_by`
  ).run(key, value, ts, updatedBy || null);
}

export interface DocumentIndexRow {
  id: string; sourceType: string; sourceId: string; collectionId: string | null; title: string | null; contentHash: string | null;
  chunkCount: number; embeddingModel: string | null; embeddingVersion: string | null;
  departmentId: string | null; visibility: string | null; securityLevel: string | null;
  sourceUpdatedAt: string | null; indexedAt: string | null; status: 'pending' | 'indexed' | 'failed';
  error: string | null; createdAt: string; updatedAt: string;
}

function rowToDocIndex(r: Record<string, unknown>): DocumentIndexRow {
  return {
    id: r.id as string, sourceType: r.source_type as string, sourceId: r.source_id as string,
    collectionId: r.collection_id as string | null,
    title: r.title as string | null, contentHash: r.content_hash as string | null,
    chunkCount: r.chunk_count as number, embeddingModel: r.embedding_model as string | null,
    embeddingVersion: r.embedding_version as string | null, departmentId: r.department_id as string | null,
    visibility: r.visibility as string | null, securityLevel: r.security_level as string | null,
    sourceUpdatedAt: r.source_updated_at as string | null, indexedAt: r.indexed_at as string | null,
    status: r.status as DocumentIndexRow['status'], error: r.error as string | null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

/** collectionId를 안 넘기면 현재 활성 컬렉션 기준(=기존 코드 대부분의 정상 경로).
 * 재인덱싱 마이그레이션(Phase 3)만 building 상태인 v2 컬렉션 id를 명시적으로 넘겨서,
 * 같은 source가 v1(active)과 v2(building)에 동시에 별도 행으로 존재할 수 있게 한다 —
 * 그래야 마이그레이션 도중에도 v1이 계속 정상 서비스된다. */
function resolveCollectionId(collectionId?: string | null): string | null {
  if (collectionId !== undefined) return collectionId;
  return getActiveVectorCollection()?.id ?? null;
}

export function getDocumentIndexRow(sourceType: string, sourceId: string, collectionId?: string): DocumentIndexRow | null {
  const db = getDb();
  const cid = resolveCollectionId(collectionId);
  const row = (cid
    ? db.prepare(`SELECT * FROM ai_document_index WHERE source_type=? AND source_id=? AND collection_id=?`).get(sourceType, sourceId, cid)
    : db.prepare(`SELECT * FROM ai_document_index WHERE source_type=? AND source_id=? AND collection_id IS NULL`).get(sourceType, sourceId)
  ) as Record<string, unknown> | undefined;
  return row ? rowToDocIndex(row) : null;
}

export function upsertDocumentIndexRow(input: {
  sourceType: string; sourceId: string; collectionId?: string; title: string; contentHash: string; chunkCount: number;
  embeddingModel: string; embeddingVersion: string; sourceUpdatedAt: string;
  departmentId?: string | null; visibility?: string | null; securityLevel?: string | null;
  status: 'pending' | 'indexed' | 'failed'; error?: string | null;
}): void {
  const db = getDb();
  const ts = now();
  const cid = resolveCollectionId(input.collectionId);
  const existing = getDocumentIndexRow(input.sourceType, input.sourceId, input.collectionId);
  if (existing) {
    db.prepare(`UPDATE ai_document_index SET title=?, content_hash=?, chunk_count=?, embedding_model=?,
        embedding_version=?, source_updated_at=?, department_id=?, visibility=?, security_level=?,
        indexed_at=?, status=?, error=?, updated_at=? WHERE id=?`
    ).run(
      input.title, input.contentHash, input.chunkCount, input.embeddingModel, input.embeddingVersion,
      input.sourceUpdatedAt, input.departmentId || null, input.visibility || null, input.securityLevel || null,
      input.status === 'indexed' ? ts : existing.indexedAt, input.status, input.error || null, ts,
      existing.id,
    );
  } else {
    db.prepare(`INSERT INTO ai_document_index
      (id, source_type, source_id, collection_id, title, content_hash, chunk_count, embedding_model, embedding_version,
       department_id, visibility, security_level, source_updated_at, indexed_at, status, error, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      newId(), input.sourceType, input.sourceId, cid, input.title, input.contentHash, input.chunkCount,
      input.embeddingModel, input.embeddingVersion, input.departmentId || null, input.visibility || null,
      input.securityLevel || null, input.sourceUpdatedAt, input.status === 'indexed' ? ts : null,
      input.status, input.error || null, ts, ts,
    );
  }
}

export function deleteDocumentIndexRow(sourceType: string, sourceId: string, collectionId?: string): void {
  const db = getDb();
  const cid = resolveCollectionId(collectionId);
  if (cid) db.prepare(`DELETE FROM ai_document_index WHERE source_type=? AND source_id=? AND collection_id=?`).run(sourceType, sourceId, cid);
  else db.prepare(`DELETE FROM ai_document_index WHERE source_type=? AND source_id=? AND collection_id IS NULL`).run(sourceType, sourceId);
}

export function listDocumentIndex(opts?: { status?: string; limit?: number; collectionId?: string }): DocumentIndexRow[] {
  const db = getDb();
  const limit = opts?.limit ?? 50;
  const cid = resolveCollectionId(opts?.collectionId);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (cid) { conditions.push('collection_id=?'); params.push(cid); } else { conditions.push('collection_id IS NULL'); }
  if (opts?.status) { conditions.push('status=?'); params.push(opts.status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM ai_document_index ${where} ORDER BY updated_at DESC LIMIT ?`).all(...params, limit) as Record<string, unknown>[];
  return rows.map(rowToDocIndex);
}

export function countDocumentIndexByStatus(collectionId?: string): Record<string, number> {
  const db = getDb();
  const cid = resolveCollectionId(collectionId);
  const rows = (cid
    ? db.prepare(`SELECT status, COUNT(*) as n FROM ai_document_index WHERE collection_id=? GROUP BY status`).all(cid)
    : db.prepare(`SELECT status, COUNT(*) as n FROM ai_document_index WHERE collection_id IS NULL GROUP BY status`).all()
  ) as { status: string; n: number }[];
  const out: Record<string, number> = { pending: 0, indexed: 0, failed: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export interface IndexJobRow {
  id: string; sourceType: string; sourceId: string; action: 'create' | 'update' | 'delete';
  targetCollectionId: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  attempts: number; lastError: string | null; createdAt: string; updatedAt: string; processedAt: string | null;
}

function rowToJob(r: Record<string, unknown>): IndexJobRow {
  return {
    id: r.id as string, sourceType: r.source_type as string, sourceId: r.source_id as string,
    action: r.action as IndexJobRow['action'], targetCollectionId: r.target_collection_id as string | null,
    status: r.status as IndexJobRow['status'],
    attempts: r.attempts as number, lastError: r.last_error as string | null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string, processedAt: r.processed_at as string | null,
  };
}

/** targetCollectionId를 안 넘기면(=undefined) 기존처럼 "현재 활성 컬렉션" 대상 잡 —
 * 재인덱싱 마이그레이션(Phase 3)만 명시적으로 building 컬렉션 id를 넘긴다. */
export function enqueueIndexJob(sourceType: string, sourceId: string, action: 'create' | 'update' | 'delete', targetCollectionId?: string): void {
  const db = getDb();
  const ts = now();
  db.prepare(`INSERT INTO ai_index_jobs (id, source_type, source_id, action, target_collection_id, status, attempts, created_at, updated_at)
    VALUES (?,?,?,?,?, 'pending', 0, ?,?)`).run(newId(), sourceType, sourceId, action, targetCollectionId ?? null, ts, ts);
}

export function claimNextJobs(batchSize: number): IndexJobRow[] {
  const db = getDb();
  const ts = now();
  const rows = db.prepare(`SELECT * FROM ai_index_jobs WHERE status IN ('pending','retrying') ORDER BY created_at ASC LIMIT ?`).all(batchSize) as Record<string, unknown>[];
  const jobs = rows.map(rowToJob);
  const mark = db.prepare(`UPDATE ai_index_jobs SET status='processing', updated_at=? WHERE id=?`);
  const tx = db.transaction(() => { for (const j of jobs) mark.run(ts, j.id); });
  tx();
  return jobs;
}

export function completeJob(id: string): void {
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE ai_index_jobs SET status='completed', processed_at=?, updated_at=? WHERE id=?`).run(ts, ts, id);
}

const MAX_JOB_ATTEMPTS = 3;

export function failJob(id: string, message: string): void {
  const db = getDb();
  const ts = now();
  const row = db.prepare(`SELECT attempts FROM ai_index_jobs WHERE id=?`).get(id) as { attempts: number } | undefined;
  const attempts = (row?.attempts || 0) + 1;
  const status = attempts >= MAX_JOB_ATTEMPTS ? 'failed' : 'retrying';
  db.prepare(`UPDATE ai_index_jobs SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?`).run(status, attempts, message, ts, id);
}

const STALE_PROCESSING_MS = 5 * 60 * 1000;

/** claimNextJobs()가 status를 'processing'으로 찍은 뒤, 실제 처리(runJob) 도중에
 * 서버 프로세스가 죽으면(배포로 인한 재시작 등) completeJob/failJob 둘 다 호출되지
 * 못한 채 'processing'에 영원히 멈춘다 — claimNextJobs는 pending/retrying만 다시
 * 꺼내므로 워커가 재기동돼도 이 잡들은 절대 재시도되지 않는다(실제 프로덕션에서
 * 재인덱싱 잡 15건이 이렇게 멈춰 마이그레이션이 98%에서 영구 정지한 사례로 발견됨).
 * 매 poll마다 일정 시간 이상 processing에 머문 잡을 회수해 failJob과 동일한
 * attempts/재시도 로직을 태운다. */
export function recoverStaleProcessingJobs(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const stale = db.prepare(`SELECT id, attempts FROM ai_index_jobs WHERE status='processing' AND updated_at < ?`).all(cutoff) as { id: string; attempts: number }[];
  if (stale.length === 0) return 0;
  const ts = now();
  const tx = db.transaction(() => {
    for (const row of stale) {
      const attempts = row.attempts + 1;
      const status = attempts >= MAX_JOB_ATTEMPTS ? 'failed' : 'retrying';
      db.prepare(`UPDATE ai_index_jobs SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?`)
        .run(status, attempts, '워커 프로세스 재시작으로 처리가 중단되어 자동 회수됨', ts, row.id);
    }
  });
  tx();
  return stale.length;
}

/** targetCollectionId를 안 넘기면 "일반(활성 컬렉션 대상) 잡만" 확인한다 — 마이그레이션 잡은
 * target_collection_id가 채워져 있어 별도로 취급되고, 서로의 큐잉을 막지 않는다(같은
 * source가 v1 동기화와 v2 마이그레이션에 동시에 큐잉될 수 있어야 함). */
export function hasActiveJob(sourceType: string, sourceId: string, targetCollectionId?: string): boolean {
  const db = getDb();
  const row = targetCollectionId
    ? db.prepare(`SELECT 1 FROM ai_index_jobs WHERE source_type=? AND source_id=? AND target_collection_id=? AND status IN ('pending','processing','retrying') LIMIT 1`).get(sourceType, sourceId, targetCollectionId)
    : db.prepare(`SELECT 1 FROM ai_index_jobs WHERE source_type=? AND source_id=? AND target_collection_id IS NULL AND status IN ('pending','processing','retrying') LIMIT 1`).get(sourceType, sourceId);
  return !!row;
}

export function countJobsByStatus(targetCollectionId?: string): Record<string, number> {
  const db = getDb();
  const rows = (targetCollectionId
    ? db.prepare(`SELECT status, COUNT(*) as n FROM ai_index_jobs WHERE target_collection_id=? GROUP BY status`).all(targetCollectionId)
    : db.prepare(`SELECT status, COUNT(*) as n FROM ai_index_jobs GROUP BY status`).all()
  ) as { status: string; n: number }[];
  const out: Record<string, number> = { pending: 0, processing: 0, completed: 0, failed: 0, retrying: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export interface ConversationRow { id: string; userId: string; userName: string | null; title: string | null; contextJson: string | null; createdAt: string; updatedAt: string }

export function createConversation(userId: string, userName: string, title?: string): ConversationRow {
  const db = getDb();
  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO ai_conversations (id, user_id, user_name, title, created_at, updated_at) VALUES (?,?,?,?,?,?)`)
    .run(id, userId, userName, title || null, ts, ts);
  return { id, userId, userName, title: title || null, contextJson: null, createdAt: ts, updatedAt: ts };
}

export function getConversation(id: string): ConversationRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM ai_conversations WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return { id: row.id as string, userId: row.user_id as string, userName: row.user_name as string | null, title: row.title as string | null, contextJson: row.context_json as string | null, createdAt: row.created_at as string, updatedAt: row.updated_at as string };
}

export function touchConversation(id: string, contextJson?: string): void {
  const db = getDb();
  if (contextJson !== undefined) db.prepare(`UPDATE ai_conversations SET updated_at=?, context_json=? WHERE id=?`).run(now(), contextJson, id);
  else db.prepare(`UPDATE ai_conversations SET updated_at=? WHERE id=?`).run(now(), id);
}

export function listConversationsForUser(userId: string, limit = 30): ConversationRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM ai_conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT ?`).all(userId, limit) as Record<string, unknown>[];
  return rows.map(row => ({ id: row.id as string, userId: row.user_id as string, userName: row.user_name as string | null, title: row.title as string | null, contextJson: row.context_json as string | null, createdAt: row.created_at as string, updatedAt: row.updated_at as string }));
}

export interface MessageRow {
  id: string; conversationId: string; role: string; content: string | null;
  providerId: string | null; model: string | null; toolCallsJson: string | null; sourcesJson: string | null;
  tokenUsageJson: string | null; createdAt: string;
}

export function addMessage(input: {
  conversationId: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string;
  providerId?: string | null; model?: string | null; toolCalls?: unknown; sources?: unknown; tokenUsage?: unknown;
}): MessageRow {
  const db = getDb();
  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO ai_messages (id, conversation_id, role, content, provider_id, model, tool_calls_json, sources_json, token_usage_json, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, input.conversationId, input.role, input.content, input.providerId || null, input.model || null,
    input.toolCalls !== undefined ? JSON.stringify(input.toolCalls) : null,
    input.sources !== undefined ? JSON.stringify(input.sources) : null,
    input.tokenUsage !== undefined ? JSON.stringify(input.tokenUsage) : null, ts,
  );
  return {
    id, conversationId: input.conversationId, role: input.role, content: input.content,
    providerId: input.providerId || null, model: input.model || null,
    toolCallsJson: input.toolCalls !== undefined ? JSON.stringify(input.toolCalls) : null,
    sourcesJson: input.sources !== undefined ? JSON.stringify(input.sources) : null,
    tokenUsageJson: input.tokenUsage !== undefined ? JSON.stringify(input.tokenUsage) : null, createdAt: ts,
  };
}

/** 최신 limit개를 가져와서(=대화가 길어져도 항상 "최근" 맥락) 반환 전에 시간순으로
 * 뒤집는다 — 예전엔 ORDER BY ASC LIMIT이라 limit을 넘는 대화에서 항상 "가장 오래된"
 * 메시지만 보이고 최근 내용은 영영 안 보이는 문제가 있었다. */
export function listMessages(conversationId: string, limit = 30): MessageRow[] {
  const db = getDb();
  const rows = (db.prepare(`SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT ?`).all(conversationId, limit) as Record<string, unknown>[]).reverse();
  return rows.map(row => ({
    id: row.id as string, conversationId: row.conversation_id as string, role: row.role as string, content: row.content as string | null,
    providerId: row.provider_id as string | null, model: row.model as string | null,
    toolCallsJson: row.tool_calls_json as string | null, sourcesJson: row.sources_json as string | null,
    tokenUsageJson: row.token_usage_json as string | null, createdAt: row.created_at as string,
  }));
}

/** listMessages가 limit으로 잘라내기 전에 실제로 이 대화에 메시지가 몇 개 있었는지 —
 * orchestrator가 "이전 대화 N건 생략됨"을 모델에 알릴지 판단하는 데만 쓰는 가벼운 COUNT. */
export function countMessages(conversationId: string): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as n FROM ai_messages WHERE conversation_id=?`).get(conversationId) as { n: number };
  return row.n;
}

/** 대화 왕복 중간에 생기는 provider 재시도/도구 호출용 내부 usage 로그가 아니라,
 * "사용자가 실제로 보낸 메시지 수"만 센다 — 그래야 한 번의 질문이 도구를 여러 번
 * 호출했다고 해서 사용자 체감 한도가 부당하게 빨리 소모되지 않는다. */
export function countUserMessagesInLastHour(userId: string): number {
  const db = getDb();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const row = db.prepare(`SELECT COUNT(*) as n FROM ai_messages m
    JOIN ai_conversations c ON c.id = m.conversation_id
    WHERE c.user_id=? AND m.role='user' AND m.created_at > ?`).get(userId, since) as { n: number };
  return row.n;
}

export function logToolCall(entry: {
  conversationId?: string | null; messageId?: string | null; userId?: string | null;
  toolName: string; args?: unknown; resultSummary?: string | null;
  allowed: boolean; deniedReason?: string | null; latencyMs?: number | null;
}): void {
  const db = getDb();
  db.prepare(`INSERT INTO ai_tool_logs (id, conversation_id, message_id, user_id, tool_name, args_json, result_summary, allowed, denied_reason, latency_ms, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    newId(), entry.conversationId || null, entry.messageId || null, entry.userId || null,
    entry.toolName, entry.args !== undefined ? JSON.stringify(entry.args) : null, entry.resultSummary || null,
    entry.allowed ? 1 : 0, entry.deniedReason || null, entry.latencyMs ?? null, now(),
  );
}

export function logUsage(entry: {
  conversationId?: string | null; messageId?: string | null; userId?: string | null; userName?: string | null;
  providerId?: string | null; providerType?: string | null; model?: string | null;
  requestType: 'chat' | 'embed' | 'tool' | 'rerank'; success: boolean; error?: string | null;
  latencyMs?: number | null; fallbackFromProviderId?: string | null;
  embeddingCalls?: number | null; rerankerCalls?: number | null; ragChunks?: number | null;
  fallbackCount?: number | null; estimatedNeurons?: number | null;
}): void {
  const db = getDb();
  db.prepare(`INSERT INTO ai_usage_logs
    (id, conversation_id, message_id, user_id, user_name, provider_id, provider_type, model,
     request_type, success, error, latency_ms, fallback_from_provider_id,
     embedding_calls, reranker_calls, rag_chunks, fallback_count, estimated_neurons, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    newId(), entry.conversationId || null, entry.messageId || null, entry.userId || null, entry.userName || null,
    entry.providerId || null, entry.providerType || null, entry.model || null,
    entry.requestType, entry.success ? 1 : 0, entry.error || null, entry.latencyMs ?? null,
    entry.fallbackFromProviderId || null,
    entry.embeddingCalls ?? null, entry.rerankerCalls ?? null, entry.ragChunks ?? null,
    entry.fallbackCount ?? null, entry.estimatedNeurons ?? null, now(),
  );
}
