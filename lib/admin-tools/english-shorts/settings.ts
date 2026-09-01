import { getDb, now } from '@/lib/db/sqlite';

export interface EnglishShortsSettings {
  maxUploadSizeMb: number;
  allowedExtensions: string[];
  maxClipsPerProject: number;
  maxRenderConcurrency: number;
  renderStaleProcessingMinutes: number;
  renderMaxAttempts: number;
  defaultTemplateId: string | null;
  subtitleFontPath: string | null;
  ffmpegContainer: string;
  outputFps: number;
  outputVideoBitrateK: number;
  outputAudioBitrateK: number;
  getyarnSearchBaseUrl: string;
}

const DEFAULTS: EnglishShortsSettings = {
  maxUploadSizeMb: 300,
  allowedExtensions: ['mp4', 'mov', 'webm', 'm4v'],
  maxClipsPerProject: 8,
  maxRenderConcurrency: 1,
  renderStaleProcessingMinutes: 15,
  renderMaxAttempts: 3,
  defaultTemplateId: null,
  subtitleFontPath: null,
  ffmpegContainer: 'tradeos-ffmpeg',
  outputFps: 30,
  outputVideoBitrateK: 6000,
  outputAudioBitrateK: 128,
  getyarnSearchBaseUrl: 'https://getyarn.it/find-yarn?text=',
};

function ensureRow() {
  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM es_settings WHERE id='default'`).get();
  if (!exists) {
    db.prepare(`INSERT INTO es_settings (id, updated_at) VALUES ('default', ?)`).run(now());
  }
}

export function getEnglishShortsSettings(): EnglishShortsSettings {
  ensureRow();
  const db = getDb();
  const row = db.prepare(`SELECT * FROM es_settings WHERE id='default'`).get() as Record<string, unknown>;
  return {
    maxUploadSizeMb: row.max_upload_size_mb as number,
    allowedExtensions: (row.allowed_extensions as string).split(',').map(s => s.trim()).filter(Boolean),
    maxClipsPerProject: row.max_clips_per_project as number,
    maxRenderConcurrency: row.max_render_concurrency as number,
    renderStaleProcessingMinutes: row.render_stale_processing_minutes as number,
    renderMaxAttempts: row.render_max_attempts as number,
    defaultTemplateId: row.default_template_id as string | null,
    subtitleFontPath: row.subtitle_font_path as string | null,
    ffmpegContainer: row.ffmpeg_container as string,
    outputFps: row.output_fps as number,
    outputVideoBitrateK: row.output_video_bitrate_k as number,
    outputAudioBitrateK: row.output_audio_bitrate_k as number,
    getyarnSearchBaseUrl: row.getyarn_search_base_url as string,
  };
}

export function updateEnglishShortsSettings(patch: Partial<EnglishShortsSettings>, updatedBy: string): void {
  ensureRow();
  const db = getDb();
  const merged = { ...getEnglishShortsSettings(), ...patch };
  db.prepare(`UPDATE es_settings SET
    max_upload_size_mb=?, allowed_extensions=?, max_clips_per_project=?, max_render_concurrency=?,
    render_stale_processing_minutes=?, render_max_attempts=?, default_template_id=?, subtitle_font_path=?,
    ffmpeg_container=?, output_fps=?, output_video_bitrate_k=?, output_audio_bitrate_k=?, getyarn_search_base_url=?,
    updated_at=?, updated_by=?
    WHERE id='default'`).run(
    merged.maxUploadSizeMb, merged.allowedExtensions.join(','), merged.maxClipsPerProject, merged.maxRenderConcurrency,
    merged.renderStaleProcessingMinutes, merged.renderMaxAttempts, merged.defaultTemplateId, merged.subtitleFontPath,
    merged.ffmpegContainer, merged.outputFps, merged.outputVideoBitrateK, merged.outputAudioBitrateK, merged.getyarnSearchBaseUrl,
    now(), updatedBy,
  );
}

export const ENGLISH_SHORTS_SETTINGS_DEFAULTS = DEFAULTS;
