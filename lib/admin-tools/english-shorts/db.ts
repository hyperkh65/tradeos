import { getDb, newId, now } from '@/lib/db/sqlite';

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
