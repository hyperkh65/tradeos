import { getDb, now } from '@/lib/db/sqlite';

export interface PhotoSettings {
  maxUploadSizeMb: number;
  maxFilesPerBatch: number;
  allowedExtensions: string[];
  trashRetentionDays: number;
  allowExternalShare: boolean;
  maxExternalShareDays: number;
  allowPasswordlessExternalShare: boolean;
  defaultAllowOriginalDownload: boolean;
  defaultWatermark: boolean;
  showExifGps: boolean;
  duplicatePolicy: 'ask' | 'reuse' | 'always_new';
  thumbSmallPx: number;
  thumbMediumPx: number;
  previewLargePx: number;
}

const DEFAULTS: PhotoSettings = {
  maxUploadSizeMb: 50,
  maxFilesPerBatch: 50,
  allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp'],
  trashRetentionDays: 30,
  allowExternalShare: true,
  maxExternalShareDays: 30,
  allowPasswordlessExternalShare: true,
  defaultAllowOriginalDownload: false,
  defaultWatermark: false,
  showExifGps: false,
  duplicatePolicy: 'ask',
  thumbSmallPx: 240,
  thumbMediumPx: 480,
  previewLargePx: 1600,
};

/** 단일 행(id='default') 없으면 기본값으로 생성 — ai_settings 류 다른 단일행 설정
 * 테이블과 동일하게 "없으면 만들고 읽는다" 패턴. */
function ensureRow() {
  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM photo_settings WHERE id='default'`).get();
  if (!exists) {
    db.prepare(`INSERT INTO photo_settings (id, updated_at) VALUES ('default', ?)`).run(now());
  }
}

export function getPhotoSettings(): PhotoSettings {
  ensureRow();
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photo_settings WHERE id='default'`).get() as Record<string, unknown>;
  return {
    maxUploadSizeMb: row.max_upload_size_mb as number,
    maxFilesPerBatch: row.max_files_per_batch as number,
    allowedExtensions: (row.allowed_extensions as string).split(',').map(s => s.trim()).filter(Boolean),
    trashRetentionDays: row.trash_retention_days as number,
    allowExternalShare: !!row.allow_external_share,
    maxExternalShareDays: row.max_external_share_days as number,
    allowPasswordlessExternalShare: !!row.allow_passwordless_external_share,
    defaultAllowOriginalDownload: !!row.default_allow_original_download,
    defaultWatermark: !!row.default_watermark,
    showExifGps: !!row.show_exif_gps,
    duplicatePolicy: row.duplicate_policy as PhotoSettings['duplicatePolicy'],
    thumbSmallPx: row.thumb_small_px as number,
    thumbMediumPx: row.thumb_medium_px as number,
    previewLargePx: row.preview_large_px as number,
  };
}

export function updatePhotoSettings(patch: Partial<PhotoSettings>, updatedBy: string): void {
  ensureRow();
  const db = getDb();
  const current = getPhotoSettings();
  const merged = { ...current, ...patch };
  db.prepare(`UPDATE photo_settings SET
    max_upload_size_mb=?, max_files_per_batch=?, allowed_extensions=?, trash_retention_days=?,
    allow_external_share=?, max_external_share_days=?, allow_passwordless_external_share=?,
    default_allow_original_download=?, default_watermark=?, show_exif_gps=?, duplicate_policy=?,
    thumb_small_px=?, thumb_medium_px=?, preview_large_px=?, updated_at=?, updated_by=?
    WHERE id='default'`).run(
    merged.maxUploadSizeMb, merged.maxFilesPerBatch, merged.allowedExtensions.join(','), merged.trashRetentionDays,
    merged.allowExternalShare ? 1 : 0, merged.maxExternalShareDays, merged.allowPasswordlessExternalShare ? 1 : 0,
    merged.defaultAllowOriginalDownload ? 1 : 0, merged.defaultWatermark ? 1 : 0, merged.showExifGps ? 1 : 0, merged.duplicatePolicy,
    merged.thumbSmallPx, merged.thumbMediumPx, merged.previewLargePx, now(), updatedBy,
  );
}

export const PHOTO_SETTINGS_DEFAULTS = DEFAULTS;
