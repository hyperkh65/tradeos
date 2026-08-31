import { ZipArchive } from 'archiver';
import { downloadPhotoFile } from '@/lib/photos/storage';
import { getPhotoById, getDerivative } from '@/lib/photos/db';
import { getOrCreateWatermarkedPreview } from '@/lib/photos/watermark';

function safeName(name: string, usedNames: Set<string>): string {
  let candidate = name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'photo';
  let n = 2;
  while (usedNames.has(candidate)) {
    const dot = candidate.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    candidate = `${stem}_${n}${ext}`;
    n++;
  }
  usedNames.add(candidate);
  return candidate;
}

export interface ZipPhotoSpec {
  id: string;
  originalFileName: string;
  /** true면 원본 그대로, false면 preview_large(워터마크가 켜져 있으면 워터마크 버전)를 담는다. */
  useOriginal: boolean;
  watermark?: boolean;
}

/** 요청서 46번: 다중 선택/공유 ZIP 일괄 다운로드 — archiver를 메모리에 전부 올리지 않고
 * 스트리밍으로 압축하며 각 파일도 하나씩 다운로드→append 한다(approval-doc/zip-package.ts와
 * 동일한 패턴). 임시 zip 파일을 디스크에 만들지 않는다(스트림 자체가 응답 바디). */
export function buildPhotoZipArchive(photos: ZipPhotoSpec[]): ZipArchive {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const usedNames = new Set<string>();

  (async () => {
    for (const spec of photos) {
      try {
        const photo = getPhotoById(spec.id);
        if (!photo || photo.deletedAt) continue;

        let buf: Buffer | null = null;
        let ext = photo.extension;
        if (spec.useOriginal) {
          buf = await downloadPhotoFile(photo.storedPath);
        } else if (spec.watermark) {
          const wm = await getOrCreateWatermarkedPreview(spec.id);
          if (wm) { buf = await downloadPhotoFile(wm.storedPath); ext = 'webp'; }
        } else {
          const preview = getDerivative(spec.id, 'preview_large');
          if (preview) { buf = await downloadPhotoFile(preview.storedPath); ext = 'webp'; }
        }
        if (!buf) continue;

        const baseName = spec.originalFileName.replace(/\.[^.]+$/, '') + '.' + ext;
        archive.append(buf, { name: safeName(baseName, usedNames) });
      } catch (e) {
        console.error('[photo zip] skip', spec.id, e);
      }
    }
    archive.finalize();
  })();

  return archive;
}
