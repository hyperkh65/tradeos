import { getDb } from '@/lib/db/sqlite';
import { nasExists, nasListFilesRecursive } from '@/lib/storage/nas';
import { PHOTO_STORAGE_ROOT } from '@/lib/photos/storage';

export interface MissingFile {
  photoId: string;
  kind: 'original' | 'thumb_small' | 'thumb_medium' | 'preview_large' | 'watermarked';
  originalFileName: string;
  storedPath: string;
}

export interface IntegrityScanResult {
  scannedAt: string;
  totalChecked: number;
  missing: MissingFile[];
  orphans: string[];
}

/** 요청서 시나리오 L — DB엔 있는데 NAS엔 없음(Missing) / NAS엔 있는데 DB엔 없음(Orphan).
 * trash(soft-delete)도 원본 파일은 그대로 남아있어야 정상이므로 deleted_at 무관하게
 * 전부 대상에 넣는다(휴지통에 있는데 파일이 사라진 것도 실제 장애라 놓치면 안 됨). */
export async function runPhotoIntegrityScan(): Promise<IntegrityScanResult> {
  const db = getDb();
  const photos = db.prepare(`SELECT id, stored_path, original_file_name FROM photos`).all() as { id: string; stored_path: string; original_file_name: string }[];
  const derivatives = db.prepare(`SELECT photo_id, kind, stored_path FROM photo_derivatives`).all() as { photo_id: string; kind: string; stored_path: string }[];

  const referenced = new Set<string>();
  const missing: MissingFile[] = [];

  for (const p of photos) {
    referenced.add(p.stored_path);
    if (!(await nasExists(p.stored_path))) {
      missing.push({ photoId: p.id, kind: 'original', originalFileName: p.original_file_name, storedPath: p.stored_path });
    }
  }
  const photoNameById = new Map(photos.map(p => [p.id, p.original_file_name]));
  for (const d of derivatives) {
    referenced.add(d.stored_path);
    if (!(await nasExists(d.stored_path))) {
      missing.push({ photoId: d.photo_id, kind: d.kind as MissingFile['kind'], originalFileName: photoNameById.get(d.photo_id) ?? '(알 수 없음)', storedPath: d.stored_path });
    }
  }

  const allFiles = await nasListFilesRecursive(PHOTO_STORAGE_ROOT);
  const orphans = allFiles.filter(f => !referenced.has(f));

  return {
    scannedAt: new Date().toISOString(),
    totalChecked: photos.length + derivatives.length,
    missing,
    orphans,
  };
}
