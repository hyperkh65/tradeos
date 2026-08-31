import { getDb, newId, now } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { canViewOwned } from '@/lib/photos/permissions';
import { hasInternalShareAccess } from '@/lib/photos/internal-shares';

export interface PhotoRow {
  id: string;
  folderId: string | null;
  originalFileName: string;
  storedPath: string;
  mimeType: string;
  extension: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  hash: string;
  capturedAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  orientation: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  hasGps: boolean;
  title: string | null;
  description: string | null;
  status: 'processing' | 'ready' | 'failed';
  previewError: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  updatedBy: string | null;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

function rowToPhoto(r: Record<string, unknown>): PhotoRow {
  return {
    id: r.id as string,
    folderId: r.folder_id as string | null,
    originalFileName: r.original_file_name as string,
    storedPath: r.stored_path as string,
    mimeType: r.mime_type as string,
    extension: r.extension as string,
    fileSize: r.file_size as number,
    width: r.width as number | null,
    height: r.height as number | null,
    hash: r.hash as string,
    capturedAt: r.captured_at as string | null,
    cameraMake: r.camera_make as string | null,
    cameraModel: r.camera_model as string | null,
    orientation: r.orientation as number | null,
    gpsLat: r.gps_lat as number | null,
    gpsLng: r.gps_lng as number | null,
    hasGps: !!r.has_gps,
    title: r.title as string | null,
    description: r.description as string | null,
    status: r.status as PhotoRow['status'],
    previewError: r.preview_error as string | null,
    uploadedBy: r.uploaded_by as string | null,
    uploadedByName: r.uploaded_by_name as string | null,
    uploadedAt: r.uploaded_at as string,
    updatedBy: r.updated_by as string | null,
    updatedAt: r.updated_at as string,
    deletedAt: r.deleted_at as string | null,
    deletedBy: r.deleted_by as string | null,
  };
}

export interface InsertPhotoInput {
  folderId: string | null;
  originalFileName: string;
  storedPath: string;
  mimeType: string;
  extension: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  hash: string;
  capturedAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  orientation: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  uploadedBy: string;
  uploadedByName: string;
}

/** id를 미리 지정할 수 있게 한다 — 업로드 라우트가 NAS 저장 경로(photos/original/…/{id}.ext)를
 * 먼저 만들고 그 파일을 실제로 올린 "뒤에" 이 함수를 호출해야, 저장 경로의 id와
 * photos.id가 항상 일치한다(둘이 따로 생성되면 stored_path가 존재하지 않는 id를
 * 가리키는 버그가 된다). */
export function insertPhoto(input: InsertPhotoInput, id: string = newId()): PhotoRow {
  const db = getDb();
  const ts = now();
  const hasGps = input.gpsLat != null && input.gpsLng != null;
  db.prepare(`INSERT INTO photos
    (id, folder_id, original_file_name, stored_path, mime_type, extension, file_size, width, height, hash,
     captured_at, camera_make, camera_model, orientation, gps_lat, gps_lng, has_gps,
     status, uploaded_by, uploaded_by_name, uploaded_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?, 'processing', ?,?,?,?)`).run(
    id, input.folderId, input.originalFileName, input.storedPath, input.mimeType, input.extension,
    input.fileSize, input.width, input.height, input.hash,
    input.capturedAt, input.cameraMake, input.cameraModel, input.orientation, input.gpsLat, input.gpsLng, hasGps ? 1 : 0,
    input.uploadedBy, input.uploadedByName, ts, ts,
  );
  return getPhotoById(id)!;
}

export function getPhotoById(id: string): PhotoRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photos WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  return row ? rowToPhoto(row) : null;
}

/** 사진의 실질적 소유자(=업로더)/공개여부 — 공개여부는 소속 폴더를 따른다(폴더 없음 = 최상위
 * = 전체 공개로 취급). favorite 라우트에서 이미 쓰던 것과 동일한 규칙을 공용 헬퍼로 뺀 것. */
export function getPhotoOwnership(photo: PhotoRow): { ownerUserId: string | null; isPublic: boolean } {
  if (!photo.folderId) return { ownerUserId: photo.uploadedBy, isPublic: true };
  const db = getDb();
  const folder = db.prepare(`SELECT is_public FROM photo_folders WHERE id=?`)
    .get(photo.folderId) as { is_public: number } | undefined;
  return { ownerUserId: photo.uploadedBy, isPublic: folder ? !!folder.is_public : true };
}

/** getPhotoOwnership 규칙(공개/본인업로드) + 사내 공유(요청서 38번, photo_internal_shares)
 * 로 view 권한을 받은 경우까지 포함한 조회 권한 판정. favorite/tags/comments/detail GET
 * 등 "이 사진을 볼 수 있는가"를 묻는 모든 곳에서 canViewOwned 대신 이걸 쓴다. */
export function canViewPhotoWithShares(user: User, photo: PhotoRow): boolean {
  const { ownerUserId, isPublic } = getPhotoOwnership(photo);
  if (canViewOwned(user, ownerUserId, isPublic)) return true;
  if (hasInternalShareAccess(user.id, 'photo', photo.id, 'view')) return true;
  if (photo.folderId && hasInternalShareAccess(user.id, 'folder', photo.folderId, 'view')) return true;
  return false;
}

/** 중복 감지(요청서 41번) — 삭제되지 않은 사진 중 같은 SHA-256 해시가 있는지 확인. */
export function findPhotoByHash(hash: string): PhotoRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photos WHERE hash=? AND deleted_at IS NULL LIMIT 1`).get(hash) as Record<string, unknown> | undefined;
  return row ? rowToPhoto(row) : null;
}

export function setPhotoStatus(id: string, status: PhotoRow['status'], previewError?: string | null): void {
  const db = getDb();
  db.prepare(`UPDATE photos SET status=?, preview_error=?, updated_at=? WHERE id=?`).run(status, previewError ?? null, now(), id);
}

// ── 파생본(썸네일/프리뷰) ────────────────────────────────────────────────────

export type DerivativeKind = 'thumb_small' | 'thumb_medium' | 'preview_large' | 'watermarked';

export function upsertDerivative(photoId: string, kind: DerivativeKind, storedPath: string, width: number, height: number, format: string): void {
  const db = getDb();
  db.prepare(`INSERT INTO photo_derivatives (id, photo_id, kind, stored_path, width, height, format, created_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(photo_id, kind) DO UPDATE SET stored_path=excluded.stored_path, width=excluded.width, height=excluded.height, format=excluded.format, created_at=excluded.created_at`)
    .run(newId(), photoId, kind, storedPath, width, height, format, now());
}

export interface DerivativeRow { kind: DerivativeKind; storedPath: string; width: number | null; height: number | null; format: string }

export function getDerivatives(photoId: string): DerivativeRow[] {
  const db = getDb();
  const rows = db.prepare(`SELECT kind, stored_path, width, height, format FROM photo_derivatives WHERE photo_id=?`).all(photoId) as Record<string, unknown>[];
  return rows.map(r => ({ kind: r.kind as DerivativeKind, storedPath: r.stored_path as string, width: r.width as number | null, height: r.height as number | null, format: r.format as string }));
}

export function getDerivative(photoId: string, kind: DerivativeKind): DerivativeRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT kind, stored_path, width, height, format FROM photo_derivatives WHERE photo_id=? AND kind=?`).get(photoId, kind) as Record<string, unknown> | undefined;
  return row ? { kind: row.kind as DerivativeKind, storedPath: row.stored_path as string, width: row.width as number | null, height: row.height as number | null, format: row.format as string } : null;
}

// ── 백그라운드 썸네일 큐 — lib/ai/db.ts의 ai_index_jobs와 동일한 claim-then-process 패턴 ──

export interface PhotoJobRow { id: string; photoId: string; status: string; attempts: number }

export function enqueuePhotoJob(photoId: string): void {
  try {
    const db = getDb();
    const ts = now();
    db.prepare(`INSERT INTO photo_jobs (id, photo_id, status, attempts, created_at, updated_at) VALUES (?,?,'pending',0,?,?)`)
      .run(newId(), photoId, ts, ts);
  } catch (e) {
    // 썸네일 큐 등록은 보조 기능 — 실패해도 업로드 자체(원본 저장)는 성공해야 한다.
    console.error('[photo job enqueue]', e);
  }
}

export function claimNextPhotoJobs(batchSize: number): PhotoJobRow[] {
  const db = getDb();
  const ts = now();
  const rows = db.prepare(`SELECT id, photo_id, status, attempts FROM photo_jobs WHERE status IN ('pending','retrying') ORDER BY created_at ASC LIMIT ?`).all(batchSize) as Record<string, unknown>[];
  const jobs = rows.map(r => ({ id: r.id as string, photoId: r.photo_id as string, status: r.status as string, attempts: r.attempts as number }));
  const mark = db.prepare(`UPDATE photo_jobs SET status='processing', updated_at=? WHERE id=?`);
  const tx = db.transaction(() => { for (const j of jobs) mark.run(ts, j.id); });
  tx();
  return jobs;
}

export function completePhotoJob(id: string): void {
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE photo_jobs SET status='completed', processed_at=?, updated_at=? WHERE id=?`).run(ts, ts, id);
}

const MAX_PHOTO_JOB_ATTEMPTS = 3;

/** 반환값: 재시도 소진으로 최종 'failed' 확정이면 true, 아직 'retrying' 남았으면 false —
 * 호출자가 photos.status를 언제 'failed'로 확정 표시할지 판단하는 데 쓴다. */
export function failPhotoJob(id: string, message: string): boolean {
  const db = getDb();
  const ts = now();
  const row = db.prepare(`SELECT attempts FROM photo_jobs WHERE id=?`).get(id) as { attempts: number } | undefined;
  const attempts = (row?.attempts || 0) + 1;
  const finalFailed = attempts >= MAX_PHOTO_JOB_ATTEMPTS;
  const status = finalFailed ? 'failed' : 'retrying';
  db.prepare(`UPDATE photo_jobs SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?`).run(status, attempts, message, ts, id);
  return finalFailed;
}

const STALE_PROCESSING_MS = 5 * 60 * 1000;

/** lib/ai/db.ts의 recoverStaleProcessingJobs()와 동일한 이유 — 서버 재시작으로
 * processing에 멈춘 잡을 회수해 재시도 대상으로 되돌린다. */
export function recoverStalePhotoJobs(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const stale = db.prepare(`SELECT id, attempts FROM photo_jobs WHERE status='processing' AND updated_at < ?`).all(cutoff) as { id: string; attempts: number }[];
  if (stale.length === 0) return 0;
  const ts = now();
  const tx = db.transaction(() => {
    for (const row of stale) {
      const attempts = row.attempts + 1;
      const status = attempts >= MAX_PHOTO_JOB_ATTEMPTS ? 'failed' : 'retrying';
      db.prepare(`UPDATE photo_jobs SET status=?, attempts=?, last_error=?, updated_at=? WHERE id=?`)
        .run(status, attempts, '워커 프로세스 재시작으로 처리가 중단되어 자동 회수됨', ts, row.id);
    }
  });
  tx();
  return stale.length;
}
