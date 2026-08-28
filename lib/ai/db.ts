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
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string | null,
  };
}

export function updateAISettings(input: Partial<{
  enabled: boolean; defaultChatProviderId: string | null; defaultEmbeddingProviderId: string | null;
  rateLimitPerUserPerHour: number; searchTopK: number;
  qdrantUrl: string | null; qdrantApiKey: string | null; qdrantCollection: string;
  updatedBy: string;
}>): AISettingsRow {
  const existing = getAISettings();
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE ai_settings SET
      enabled=?, default_chat_provider_id=?, default_embedding_provider_id=?,
      rate_limit_per_user_per_hour=?, search_top_k=?, qdrant_url=?, qdrant_api_key_encrypted=?,
      qdrant_collection=?, updated_at=?, updated_by=?
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
    ts, input.updatedBy || null,
  );
  return getAISettings();
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
  id: string; sourceType: string; sourceId: string; title: string | null; contentHash: string | null;
  chunkCount: number; embeddingModel: string | null; embeddingVersion: string | null;
  departmentId: string | null; visibility: string | null; securityLevel: string | null;
  sourceUpdatedAt: string | null; indexedAt: string | null; status: 'pending' | 'indexed' | 'failed';
  error: string | null; createdAt: string; updatedAt: string;
}

function rowToDocIndex(r: Record<string, unknown>): DocumentIndexRow {
  return {
    id: r.id as string, sourceType: r.source_type as string, sourceId: r.source_id as string,
    title: r.title as string | null, contentHash: r.content_hash as string | null,
    chunkCount: r.chunk_count as number, embeddingModel: r.embedding_model as string | null,
    embeddingVersion: r.embedding_version as string | null, departmentId: r.department_id as string | null,
    visibility: r.visibility as string | null, securityLevel: r.security_level as string | null,
    sourceUpdatedAt: r.source_updated_at as string | null, indexedAt: r.indexed_at as string | null,
    status: r.status as DocumentIndexRow['status'], error: r.error as string | null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function getDocumentIndexRow(sourceType: string, sourceId: string): DocumentIndexRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM ai_document_index WHERE source_type=? AND source_id=?`).get(sourceType, sourceId) as Record<string, unknown> | undefined;
  return row ? rowToDocIndex(row) : null;
}

export function upsertDocumentIndexRow(input: {
  sourceType: string; sourceId: string; title: string; contentHash: string; chunkCount: number;
  embeddingModel: string; embeddingVersion: string; sourceUpdatedAt: string;
  departmentId?: string | null; visibility?: string | null; securityLevel?: string | null;
  status: 'pending' | 'indexed' | 'failed'; error?: string | null;
}): void {
  const db = getDb();
  const ts = now();
  const existing = getDocumentIndexRow(input.sourceType, input.sourceId);
  if (existing) {
    db.prepare(`UPDATE ai_document_index SET title=?, content_hash=?, chunk_count=?, embedding_model=?,
        embedding_version=?, source_updated_at=?, department_id=?, visibility=?, security_level=?,
        indexed_at=?, status=?, error=?, updated_at=? WHERE source_type=? AND source_id=?`
    ).run(
      input.title, input.contentHash, input.chunkCount, input.embeddingModel, input.embeddingVersion,
      input.sourceUpdatedAt, input.departmentId || null, input.visibility || null, input.securityLevel || null,
      input.status === 'indexed' ? ts : existing.indexedAt, input.status, input.error || null, ts,
      input.sourceType, input.sourceId,
    );
  } else {
    db.prepare(`INSERT INTO ai_document_index
      (id, source_type, source_id, title, content_hash, chunk_count, embedding_model, embedding_version,
       department_id, visibility, security_level, source_updated_at, indexed_at, status, error, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      newId(), input.sourceType, input.sourceId, input.title, input.contentHash, input.chunkCount,
      input.embeddingModel, input.embeddingVersion, input.departmentId || null, input.visibility || null,
      input.securityLevel || null, input.sourceUpdatedAt, input.status === 'indexed' ? ts : null,
      input.status, input.error || null, ts, ts,
    );
  }
}

export function deleteDocumentIndexRow(sourceType: string, sourceId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM ai_document_index WHERE source_type=? AND source_id=?`).run(sourceType, sourceId);
}

export function listDocumentIndex(opts?: { status?: string; limit?: number }): DocumentIndexRow[] {
  const db = getDb();
  const limit = opts?.limit ?? 50;
  const rows = opts?.status
    ? db.prepare(`SELECT * FROM ai_document_index WHERE status=? ORDER BY updated_at DESC LIMIT ?`).all(opts.status, limit) as Record<string, unknown>[]
    : db.prepare(`SELECT * FROM ai_document_index ORDER BY updated_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
  return rows.map(rowToDocIndex);
}

export function countDocumentIndexByStatus(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(`SELECT status, COUNT(*) as n FROM ai_document_index GROUP BY status`).all() as { status: string; n: number }[];
  const out: Record<string, number> = { pending: 0, indexed: 0, failed: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export interface IndexJobRow {
  id: string; sourceType: string; sourceId: string; action: 'create' | 'update' | 'delete';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  attempts: number; lastError: string | null; createdAt: string; updatedAt: string; processedAt: string | null;
}

function rowToJob(r: Record<string, unknown>): IndexJobRow {
  return {
    id: r.id as string, sourceType: r.source_type as string, sourceId: r.source_id as string,
    action: r.action as IndexJobRow['action'], status: r.status as IndexJobRow['status'],
    attempts: r.attempts as number, lastError: r.last_error as string | null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string, processedAt: r.processed_at as string | null,
  };
}

export function enqueueIndexJob(sourceType: string, sourceId: string, action: 'create' | 'update' | 'delete'): void {
  const db = getDb();
  const ts = now();
  db.prepare(`INSERT INTO ai_index_jobs (id, source_type, source_id, action, status, attempts, created_at, updated_at)
    VALUES (?,?,?,?, 'pending', 0, ?,?)`).run(newId(), sourceType, sourceId, action, ts, ts);
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

export function hasActiveJob(sourceType: string, sourceId: string): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT 1 FROM ai_index_jobs WHERE source_type=? AND source_id=? AND status IN ('pending','processing','retrying') LIMIT 1`).get(sourceType, sourceId);
  return !!row;
}

export function countJobsByStatus(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(`SELECT status, COUNT(*) as n FROM ai_index_jobs GROUP BY status`).all() as { status: string; n: number }[];
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

export function listMessages(conversationId: string, limit = 30): MessageRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT ?`).all(conversationId, limit) as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string, conversationId: row.conversation_id as string, role: row.role as string, content: row.content as string | null,
    providerId: row.provider_id as string | null, model: row.model as string | null,
    toolCallsJson: row.tool_calls_json as string | null, sourcesJson: row.sources_json as string | null,
    tokenUsageJson: row.token_usage_json as string | null, createdAt: row.created_at as string,
  }));
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
  requestType: 'chat' | 'embed' | 'tool'; success: boolean; error?: string | null;
  latencyMs?: number | null; fallbackFromProviderId?: string | null;
}): void {
  const db = getDb();
  db.prepare(`INSERT INTO ai_usage_logs
    (id, conversation_id, message_id, user_id, user_name, provider_id, provider_type, model,
     request_type, success, error, latency_ms, fallback_from_provider_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    newId(), entry.conversationId || null, entry.messageId || null, entry.userId || null, entry.userName || null,
    entry.providerId || null, entry.providerType || null, entry.model || null,
    entry.requestType, entry.success ? 1 : 0, entry.error || null, entry.latencyMs ?? null,
    entry.fallbackFromProviderId || null, now(),
  );
}
