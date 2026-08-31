import sharp from 'sharp';
import { downloadPhotoFile, uploadPhotoFile, buildDerivativePath } from './storage';
import { getPhotoById, setPhotoStatus, upsertDerivative, claimNextPhotoJobs, completePhotoJob, failPhotoJob, recoverStalePhotoJobs } from './db';
import { getPhotoSettings } from './settings';

/** 원본 하나로부터 thumb_small/thumb_medium/preview_large 3종 WebP 파생본을 만든다.
 * sharp().rotate()를 인자 없이 호출하면 EXIF Orientation을 읽어 자동으로 바로 세운 뒤
 * 픽셀을 다시 쓰므로(요청서 53번), 이후 파생본에는 방향 metadata가 아니라 실제로
 * 바른 방향의 픽셀이 들어간다 — 원본 파일 자체는 절대 건드리지 않는다. */
export async function processPhotoJob(photoId: string): Promise<void> {
  const photo = getPhotoById(photoId);
  if (!photo) throw new Error(`photo not found: ${photoId}`);

  const original = await downloadPhotoFile(photo.storedPath);
  if (!original) throw new Error('원본 파일을 NAS에서 읽을 수 없습니다');

  const settings = getPhotoSettings();
  const sizes: { kind: 'thumb_small' | 'thumb_medium' | 'preview_large'; px: number }[] = [
    { kind: 'thumb_small', px: settings.thumbSmallPx },
    { kind: 'thumb_medium', px: settings.thumbMediumPx },
    { kind: 'preview_large', px: settings.previewLargePx },
  ];

  for (const { kind, px } of sizes) {
    const buf = await sharp(original, { failOn: 'none' })
      .rotate() // EXIF orientation 자동 보정 (무인자)
      .resize({ width: px, height: px, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: kind === 'preview_large' ? 85 : 75 })
      .toBuffer();
    const meta = await sharp(buf).metadata();
    const path = buildDerivativePath(photoId, kind);
    const res = await uploadPhotoFile(path, buf, 'image/webp');
    if (!res.success || !res.path) throw new Error(`파생본 저장 실패(${kind}): ${res.error}`);
    upsertDerivative(photoId, kind, res.path, meta.width || 0, meta.height || 0, 'webp');
  }

  setPhotoStatus(photoId, 'ready');
}

/** instrumentation.ts에서 등록한 setInterval이 매 tick마다 부른다 —
 * lib/ai/jobs.ts의 processNextJobs()와 동일한 claim-then-process 구조. */
export async function processNextPhotoJobs(batchSize: number): Promise<void> {
  const recovered = recoverStalePhotoJobs();
  if (recovered > 0) console.warn(`[photo-worker] ${recovered}개 stale job 회수`);

  const jobs = claimNextPhotoJobs(batchSize);
  for (const job of jobs) {
    try {
      await processPhotoJob(job.photoId);
      completePhotoJob(job.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const finalFailed = failPhotoJob(job.id, message);
      // 재시도 소진(failed 확정) 시에만 원본은 보존한 채 상태를 명확히 failed로 표시(요청서 52번).
      // 아직 재시도가 남았으면(retrying) photos.status는 'processing'으로 둔다.
      if (finalFailed) setPhotoStatus(job.photoId, 'failed', message);
    }
  }
}
