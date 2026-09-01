import { getDb, newId, now, nextBizId } from '@/lib/db/sqlite';

export interface SourceRow {
  id: string;
  sourceKind: 'upload' | 'url_reference';
  hash: string | null;
  referenceUrl: string | null;
  originalFileName: string | null;
  storedPath: string | null;
  mimeType: string | null;
  extension: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  title: string | null;
  notes: string | null;
  sourceOrigin: string | null;
  rightsNote: string | null;
  usageNote: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

function rowToSource(r: Record<string, unknown>): SourceRow {
  return {
    id: r.id as string, sourceKind: r.source_kind as SourceRow['sourceKind'], hash: r.hash as string | null,
    referenceUrl: r.reference_url as string | null, originalFileName: r.original_file_name as string | null,
    storedPath: r.stored_path as string | null, mimeType: r.mime_type as string | null, extension: r.extension as string | null,
    fileSize: r.file_size as number | null, width: r.width as number | null, height: r.height as number | null,
    durationSec: r.duration_sec as number | null, videoCodec: r.video_codec as string | null, audioCodec: r.audio_codec as string | null,
    title: r.title as string | null, notes: r.notes as string | null,
    sourceOrigin: r.source_origin as string | null, rightsNote: r.rights_note as string | null, usageNote: r.usage_note as string | null,
    uploadedBy: r.uploaded_by as string | null, uploadedByName: r.uploaded_by_name as string | null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    deletedAt: r.deleted_at as string | null, deletedBy: r.deleted_by as string | null,
  };
}

export interface InsertSourceInput {
  sourceKind: 'upload' | 'url_reference';
  hash?: string | null;
  referenceUrl?: string | null;
  originalFileName?: string | null;
  storedPath?: string | null;
  mimeType?: string | null;
  extension?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  title?: string | null;
  notes?: string | null;
  sourceOrigin?: string | null;
  rightsNote?: string | null;
  usageNote?: string | null;
  uploadedBy: string;
  uploadedByName: string;
}

/** id를 미리 지정할 수 있게 한다 — 업로드 라우트가 NAS 저장 경로를 먼저 만들고
 * 그 파일을 실제로 올린 "뒤에" 이 함수를 호출해야, 저장 경로의 id와 es_sources.id가
 * 항상 일치한다(사진첩 lib/photos/db.ts의 insertPhoto와 동일한 이유로 필요한 관례 —
 * 따로 생성하면 stored_path가 존재하지 않는 id를 가리키는 버그가 됨). */
export function insertSource(input: InsertSourceInput, id: string = newId()): SourceRow {
  const db = getDb();
  const ts = now();
  db.prepare(`INSERT INTO es_sources
    (id, source_kind, hash, reference_url, original_file_name, stored_path, mime_type, extension, file_size,
     width, height, duration_sec, video_codec, audio_codec, title, notes, source_origin, rights_note, usage_note,
     uploaded_by, uploaded_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?, ?,?,?,?)`).run(
    id, input.sourceKind, input.hash ?? null, input.referenceUrl ?? null, input.originalFileName ?? null,
    input.storedPath ?? null, input.mimeType ?? null, input.extension ?? null, input.fileSize ?? null,
    input.width ?? null, input.height ?? null, input.durationSec ?? null, input.videoCodec ?? null, input.audioCodec ?? null,
    input.title ?? null, input.notes ?? null, input.sourceOrigin ?? null, input.rightsNote ?? null, input.usageNote ?? null,
    input.uploadedBy, input.uploadedByName, ts, ts,
  );
  return getSourceById(id)!;
}

export function getSourceById(id: string): SourceRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM es_sources WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToSource(row) : null;
}

/** 중복 감지(요청서 85번) — 이미 있는 원본을 다시 업로드하면 새 row를 만들지 않고
 * 기존 것을 재사용한다. */
export function findSourceByHash(hash: string): SourceRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM es_sources WHERE hash=? AND deleted_at IS NULL LIMIT 1`).get(hash) as Record<string, unknown> | undefined;
  return row ? rowToSource(row) : null;
}

export function listSources(includeDeleted = false): SourceRow[] {
  const db = getDb();
  const rows = includeDeleted
    ? db.prepare(`SELECT * FROM es_sources ORDER BY created_at DESC`).all()
    : db.prepare(`SELECT * FROM es_sources WHERE deleted_at IS NULL ORDER BY created_at DESC`).all();
  return (rows as Record<string, unknown>[]).map(rowToSource);
}

export function softDeleteSource(id: string, deletedBy: string): boolean {
  const db = getDb();
  const res = db.prepare(`UPDATE es_sources SET deleted_at=?, deleted_by=?, updated_at=? WHERE id=? AND deleted_at IS NULL`)
    .run(now(), deletedBy, now(), id);
  return res.changes > 0;
}

/** 여러 프로젝트가 같은 source를 참조할 수 있어(공유 라이브러리), 삭제 전
 * 참조 개수를 확인해야 한다(요청서 84번). */
export function countProjectReferences(sourceId: string): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as c FROM es_project_sources WHERE source_id=?`).get(sourceId) as { c: number };
  return row.c;
}

// ── 표현(Expression) ────────────────────────────────────────────────────

export interface ExpressionRow {
  id: string;
  expression: string;
  expressionNormalized: string;
  koreanMeaning: string | null;
  explanation: string | null;
  examples: { en: string; ko: string }[];
  suggestedTitle: string | null;
  suggestedDescription: string | null;
  suggestedCaption: string | null;
  hashtags: string[];
  aiProviderId: string | null;
  aiModel: string | null;
  usedCount: number;
  lastUsedAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToExpression(r: Record<string, unknown>): ExpressionRow {
  let examples: { en: string; ko: string }[] = [];
  let hashtags: string[] = [];
  try { examples = JSON.parse((r.examples_json as string) || '[]'); } catch { /* ignore */ }
  try { hashtags = JSON.parse((r.hashtags_json as string) || '[]'); } catch { /* ignore */ }
  return {
    id: r.id as string, expression: r.expression as string, expressionNormalized: r.expression_normalized as string,
    koreanMeaning: r.korean_meaning as string | null, explanation: r.explanation as string | null, examples,
    suggestedTitle: r.suggested_title as string | null, suggestedDescription: r.suggested_description as string | null,
    suggestedCaption: r.suggested_caption as string | null, hashtags,
    aiProviderId: r.ai_provider_id as string | null, aiModel: r.ai_model as string | null,
    usedCount: r.used_count as number, lastUsedAt: r.last_used_at as string | null,
    createdBy: r.created_by as string | null, createdByName: r.created_by_name as string | null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export function normalizeExpression(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function findExpressionByNormalized(normalized: string): ExpressionRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM es_expressions WHERE expression_normalized=?`).get(normalized) as Record<string, unknown> | undefined;
  return row ? rowToExpression(row) : null;
}

export function getExpressionById(id: string): ExpressionRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM es_expressions WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToExpression(row) : null;
}

export function listExpressions(search?: string): ExpressionRow[] {
  const db = getDb();
  const rows = search
    ? db.prepare(`SELECT * FROM es_expressions WHERE expression_normalized LIKE ? ORDER BY created_at DESC LIMIT 200`).all(`%${normalizeExpression(search)}%`)
    : db.prepare(`SELECT * FROM es_expressions ORDER BY created_at DESC LIMIT 200`).all();
  return (rows as Record<string, unknown>[]).map(rowToExpression);
}

export interface InsertExpressionInput {
  expression: string;
  koreanMeaning?: string | null;
  explanation?: string | null;
  examples?: { en: string; ko: string }[];
  suggestedTitle?: string | null;
  suggestedDescription?: string | null;
  suggestedCaption?: string | null;
  hashtags?: string[];
  aiProviderId?: string | null;
  aiModel?: string | null;
  rawResponse?: string | null;
  createdBy: string;
  createdByName: string;
}

export function insertExpression(input: InsertExpressionInput): ExpressionRow {
  const db = getDb();
  const id = newId();
  const ts = now();
  const normalized = normalizeExpression(input.expression);
  db.prepare(`INSERT INTO es_expressions
    (id, expression, expression_normalized, korean_meaning, explanation, examples_json, suggested_title,
     suggested_description, suggested_caption, hashtags_json, ai_provider_id, ai_model, raw_response,
     created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?)`).run(
    id, input.expression, normalized, input.koreanMeaning ?? null, input.explanation ?? null,
    JSON.stringify(input.examples ?? []), input.suggestedTitle ?? null,
    input.suggestedDescription ?? null, input.suggestedCaption ?? null, JSON.stringify(input.hashtags ?? []),
    input.aiProviderId ?? null, input.aiModel ?? null, input.rawResponse ?? null,
    input.createdBy, input.createdByName, ts, ts,
  );
  return getExpressionById(id)!;
}

export function touchExpressionUsage(id: string): void {
  const db = getDb();
  db.prepare(`UPDATE es_expressions SET used_count = used_count + 1, last_used_at=? WHERE id=?`).run(now(), id);
}

export interface UpdateExpressionAiFieldsInput {
  koreanMeaning: string | null;
  explanation: string | null;
  examples: { en: string; ko: string }[];
  suggestedTitle: string | null;
  suggestedDescription: string | null;
  suggestedCaption: string | null;
  hashtags: string[];
  aiProviderId: string | null;
  aiModel: string | null;
  rawResponse: string | null;
}

/** AI 재분석(regenerate:true) 결과로 기존 row를 덮어쓴다 — 관리자가 이후 직접 수정한
 * 값(es_projects 쪽 title/description 등)은 건드리지 않고 es_expressions(원천 캐시)만 갱신. */
export function updateExpressionAiFields(id: string, input: UpdateExpressionAiFieldsInput): ExpressionRow | null {
  const db = getDb();
  db.prepare(`UPDATE es_expressions SET korean_meaning=?, explanation=?, examples_json=?, suggested_title=?,
    suggested_description=?, suggested_caption=?, hashtags_json=?, ai_provider_id=?, ai_model=?, raw_response=?, updated_at=?
    WHERE id=?`).run(
    input.koreanMeaning, input.explanation, JSON.stringify(input.examples), input.suggestedTitle,
    input.suggestedDescription, input.suggestedCaption, JSON.stringify(input.hashtags),
    input.aiProviderId, input.aiModel, input.rawResponse, now(), id,
  );
  return getExpressionById(id);
}

// ── 프로젝트(Project) ───────────────────────────────────────────────────

export interface ProjectRow {
  id: string;
  businessId: string;
  expressionId: string;
  title: string | null;
  description: string | null;
  caption: string | null;
  hashtags: string[];
  templateId: string | null;
  templateSettings: Record<string, unknown> | null;
  status: 'draft' | 'source_required' | 'ready' | 'rendering' | 'completed' | 'failed' | 'archived';
  outputVideoPath: string | null;
  outputThumbnailPath: string | null;
  outputDurationSec: number | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

function rowToProject(r: Record<string, unknown>): ProjectRow {
  let hashtags: string[] = [];
  let templateSettings: Record<string, unknown> | null = null;
  try { hashtags = JSON.parse((r.hashtags_json as string) || '[]'); } catch { /* ignore */ }
  if (r.template_settings_json) { try { templateSettings = JSON.parse(r.template_settings_json as string); } catch { /* ignore */ } }
  return {
    id: r.id as string, businessId: r.business_id as string, expressionId: r.expression_id as string,
    title: r.title as string | null, description: r.description as string | null, caption: r.caption as string | null, hashtags,
    templateId: r.template_id as string | null, templateSettings,
    status: r.status as ProjectRow['status'],
    outputVideoPath: r.output_video_path as string | null, outputThumbnailPath: r.output_thumbnail_path as string | null,
    outputDurationSec: r.output_duration_sec as number | null,
    createdBy: r.created_by as string | null, createdByName: r.created_by_name as string | null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    deletedAt: r.deleted_at as string | null, deletedBy: r.deleted_by as string | null,
  };
}

export function insertProject(expressionId: string, createdBy: string, createdByName: string): ProjectRow {
  const db = getDb();
  const id = newId();
  const businessId = nextBizId('ES');
  const ts = now();
  db.prepare(`INSERT INTO es_projects (id, business_id, expression_id, status, created_by, created_by_name, created_at, updated_at)
    VALUES (?,?,?,'draft',?,?,?,?)`).run(id, businessId, expressionId, createdBy, createdByName, ts, ts);
  return getProjectById(id)!;
}

export function getProjectById(id: string): ProjectRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM es_projects WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : null;
}

export interface ListProjectsOptions {
  status?: ProjectRow['status'];
  search?: string;
  includeDeleted?: boolean;
}

export function listProjects(opts: ListProjectsOptions = {}): (ProjectRow & { expression: string })[] {
  const db = getDb();
  const conds: string[] = [];
  const params: unknown[] = [];
  if (!opts.includeDeleted) conds.push('p.deleted_at IS NULL');
  if (opts.status) { conds.push('p.status=?'); params.push(opts.status); }
  if (opts.search) { conds.push('e.expression_normalized LIKE ?'); params.push(`%${normalizeExpression(opts.search)}%`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT p.*, e.expression as expression FROM es_projects p
    JOIN es_expressions e ON e.id = p.expression_id
    ${where} ORDER BY p.created_at DESC LIMIT 500
  `).all(...params) as Record<string, unknown>[];
  return rows.map(r => ({ ...rowToProject(r), expression: r.expression as string }));
}

export interface UpdateProjectInput {
  title?: string | null;
  description?: string | null;
  caption?: string | null;
  hashtags?: string[];
  templateId?: string | null;
  templateSettings?: Record<string, unknown> | null;
  status?: ProjectRow['status'];
  outputVideoPath?: string | null;
  outputThumbnailPath?: string | null;
  outputDurationSec?: number | null;
}

export function updateProject(id: string, patch: UpdateProjectInput): ProjectRow | null {
  const db = getDb();
  const existing = getProjectById(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  db.prepare(`UPDATE es_projects SET title=?, description=?, caption=?, hashtags_json=?, template_id=?,
    template_settings_json=?, status=?, output_video_path=?, output_thumbnail_path=?, output_duration_sec=?, updated_at=?
    WHERE id=?`).run(
    merged.title, merged.description, merged.caption, JSON.stringify(merged.hashtags ?? []), merged.templateId,
    merged.templateSettings ? JSON.stringify(merged.templateSettings) : null, merged.status,
    merged.outputVideoPath, merged.outputThumbnailPath, merged.outputDurationSec, now(), id,
  );
  return getProjectById(id);
}

export function softDeleteProject(id: string, deletedBy: string): boolean {
  const db = getDb();
  const res = db.prepare(`UPDATE es_projects SET deleted_at=?, deleted_by=?, updated_at=? WHERE id=? AND deleted_at IS NULL`)
    .run(now(), deletedBy, now(), id);
  return res.changes > 0;
}

// ── 프로젝트-소스 연결(순서/트림) ──────────────────────────────────────────

export interface ProjectSourceRow {
  id: string;
  projectId: string;
  sourceId: string;
  position: number;
  trimStartSec: number;
  trimEndSec: number | null;
  clipLabel: string | null;
  createdAt: string;
  source: SourceRow;
}

function rowToProjectSource(r: Record<string, unknown>): ProjectSourceRow {
  return {
    id: r.link_id as string, projectId: r.project_id as string, sourceId: r.source_id as string,
    position: r.position as number, trimStartSec: r.trim_start_sec as number, trimEndSec: r.trim_end_sec as number | null,
    clipLabel: r.clip_label as string | null, createdAt: r.link_created_at as string,
    source: rowToSource(r),
  };
}

/** JOIN해서 소스 메타데이터까지 한 번에 반환 — 순서(position) 그대로 정렬.
 * ps.id/s.id처럼 컬럼명이 겹치는 경우 SQLite/better-sqlite3는 나중에 선택된 컬럼이
 * 덮어쓰므로(마지막 s.*가 이김) link 쪽 id/created_at은 반드시 별칭을 줘야 한다. */
export function listProjectSources(projectId: string): ProjectSourceRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ps.id as link_id, ps.project_id, ps.source_id, ps.position, ps.trim_start_sec, ps.trim_end_sec,
           ps.clip_label, ps.created_at as link_created_at,
           s.*
    FROM es_project_sources ps JOIN es_sources s ON s.id = ps.source_id
    WHERE ps.project_id=? ORDER BY ps.position ASC
  `).all(projectId) as Record<string, unknown>[];
  return rows.map(rowToProjectSource);
}

export function countProjectSources(projectId: string): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as c FROM es_project_sources WHERE project_id=?`).get(projectId) as { c: number };
  return row.c;
}

/** 새 클립은 항상 맨 뒤에 붙는다(position = 현재 최대값+1). */
export function attachProjectSource(projectId: string, sourceId: string, trimStartSec = 0, trimEndSec: number | null = null): ProjectSourceRow {
  const db = getDb();
  const maxPos = db.prepare(`SELECT COALESCE(MAX(position), -1) as m FROM es_project_sources WHERE project_id=?`).get(projectId) as { m: number };
  const id = newId();
  db.prepare(`INSERT INTO es_project_sources (id, project_id, source_id, position, trim_start_sec, trim_end_sec, created_at)
    VALUES (?,?,?,?,?,?,?)`).run(id, projectId, sourceId, maxPos.m + 1, trimStartSec, trimEndSec, now());
  return listProjectSources(projectId).find(ps => ps.id === id)!;
}

export interface UpdateProjectSourceInput {
  trimStartSec?: number;
  trimEndSec?: number | null;
  clipLabel?: string | null;
}

export function updateProjectSource(linkId: string, patch: UpdateProjectSourceInput): void {
  const db = getDb();
  const existing = db.prepare(`SELECT trim_start_sec, trim_end_sec, clip_label FROM es_project_sources WHERE id=?`).get(linkId) as
    { trim_start_sec: number; trim_end_sec: number | null; clip_label: string | null } | undefined;
  if (!existing) return;
  const merged = {
    trimStartSec: patch.trimStartSec ?? existing.trim_start_sec,
    trimEndSec: patch.trimEndSec !== undefined ? patch.trimEndSec : existing.trim_end_sec,
    clipLabel: patch.clipLabel !== undefined ? patch.clipLabel : existing.clip_label,
  };
  db.prepare(`UPDATE es_project_sources SET trim_start_sec=?, trim_end_sec=?, clip_label=? WHERE id=?`)
    .run(merged.trimStartSec, merged.trimEndSec, merged.clipLabel, linkId);
}

export function detachProjectSource(linkId: string): boolean {
  const db = getDb();
  const res = db.prepare(`DELETE FROM es_project_sources WHERE id=?`).run(linkId);
  return res.changes > 0;
}

/** 순서 재배열 — 프론트에서 드래그로 정렬한 전체 linkId 배열을 그대로 받아
 * 0부터 다시 채번한다(중간에 구멍 생기지 않게, 트랜잭션으로 원자적 처리). */
export function reorderProjectSources(projectId: string, orderedLinkIds: string[]): void {
  const db = getDb();
  const tx = db.transaction(() => {
    orderedLinkIds.forEach((linkId, idx) => {
      db.prepare(`UPDATE es_project_sources SET position=? WHERE id=? AND project_id=?`).run(idx, linkId, projectId);
    });
  });
  tx();
}

export interface TemplateSettingsField {
  key: string;
  label: string;
  type: 'select' | 'number' | 'color' | 'boolean';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}
export interface TemplateLayout {
  kind: string;
  defaults: Record<string, unknown>;
  settingsSchema: TemplateSettingsField[];
}
export interface TemplateRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  layout: TemplateLayout;
  thumbnailPreviewPath: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function rowToTemplate(r: Record<string, unknown>): TemplateRow {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    description: r.description as string | null,
    layout: JSON.parse(r.layout_json as string),
    thumbnailPreviewPath: r.thumbnail_preview_path as string | null,
    enabled: !!r.enabled,
    sortOrder: r.sort_order as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function listTemplates(includeDisabled = false): TemplateRow[] {
  const db = getDb();
  const rows = db.prepare(
    includeDisabled
      ? `SELECT * FROM es_templates ORDER BY sort_order ASC`
      : `SELECT * FROM es_templates WHERE enabled=1 ORDER BY sort_order ASC`
  ).all() as Record<string, unknown>[];
  return rows.map(rowToTemplate);
}

export function getTemplateById(id: string): TemplateRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM es_templates WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToTemplate(row) : null;
}

/** 프로젝트 복제 — 같은 expression을 참조하는 새 프로젝트를 만들고 제목/설명/
 * 캡션/해시태그/템플릿+설정/연결된 소스(트림·순서 포함)를 그대로 복사한다.
 * 렌더 결과물(output_*)은 절대 복사하지 않는다(새 프로젝트는 아직 렌더된 적
 * 없는 상태로 시작해야 한다 — 가짜로 이미 렌더된 것처럼 보이면 안 됨). */
export function duplicateProject(projectId: string, createdBy: string, createdByName: string): ProjectRow {
  const db = getDb();
  const original = getProjectById(projectId);
  if (!original) throw new Error('원본 프로젝트를 찾을 수 없습니다');

  const newProjectId = newId();
  const businessId = nextBizId('ES');
  const ts = now();
  const links = listProjectSources(projectId);
  const hasSources = links.length > 0;

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO es_projects
      (id, business_id, expression_id, title, description, caption, hashtags_json, template_id, template_settings_json,
       status, created_by, created_by_name, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        newProjectId, businessId, original.expressionId, original.title, original.description, original.caption,
        JSON.stringify(original.hashtags), original.templateId,
        original.templateSettings ? JSON.stringify(original.templateSettings) : null,
        hasSources ? 'ready' : 'draft', createdBy, createdByName, ts, ts,
      );
    const insertLink = db.prepare(`INSERT INTO es_project_sources
      (id, project_id, source_id, position, trim_start_sec, trim_end_sec, clip_label, created_at)
      VALUES (?,?,?,?,?,?,?,?)`);
    for (const link of links) {
      insertLink.run(newId(), newProjectId, link.sourceId, link.position, link.trimStartSec, link.trimEndSec, link.clipLabel, ts);
    }
  });
  tx();

  return getProjectById(newProjectId)!;
}
