import fs from 'fs';
import { getDb } from '@/lib/db/sqlite';
import { nasStat } from '@/lib/storage/nas';

export interface PhotoStorageStats {
  totalPhotos: number;
  trashedPhotos: number;
  originalBytes: number;
  derivativeBytes: number;
  totalBytes: number;
  last30dPhotos: number;
  last30dBytes: number;
  nasMode: 'local' | 'webdav';
  nasFreeBytes: number | null;
  nasTotalBytes: number | null;
  nasFreePercent: number | null;
}

/** 새로 생긴 file_size 컬럼이라 기존 파생본 행엔 값이 없을 수 있다 — 대시보드를 열 때마다
 * NULL인 것만 NAS에 실제로 stat해서 채운다(운영 초기라 건수가 적어 매번 전수 stat해도
 * 무리 없음; 많아지면 이 함수 자체가 자연스럽게 no-op에 가까워진다). */
async function backfillDerivativeSizes(): Promise<void> {
  const db = getDb();
  const rows = db.prepare(`SELECT id, stored_path FROM photo_derivatives WHERE file_size IS NULL LIMIT 500`).all() as { id: string; stored_path: string }[];
  if (rows.length === 0) return;
  const update = db.prepare(`UPDATE photo_derivatives SET file_size=? WHERE id=?`);
  await Promise.all(rows.map(async r => {
    const st = await nasStat(r.stored_path);
    if (st) update.run(st.size, r.id);
  }));
}

function isWebDavConfigured(): boolean {
  return !!(process.env.NAS_WEBDAV_URL?.trim());
}

function localUploadRoot(): string {
  return process.env.UPLOAD_DIR || (process.env.NODE_ENV === 'production' ? '/volume1/web/tradeos/data/uploads' : `${process.cwd()}/data/uploads`);
}

export async function getPhotoStorageStats(): Promise<PhotoStorageStats> {
  await backfillDerivativeSizes();
  const db = getDb();

  const active = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(file_size),0) AS bytes FROM photos WHERE deleted_at IS NULL`).get() as { c: number; bytes: number };
  const trashed = db.prepare(`SELECT COUNT(*) AS c FROM photos WHERE deleted_at IS NOT NULL`).get() as { c: number };
  const derivBytes = db.prepare(`SELECT COALESCE(SUM(file_size),0) AS bytes FROM photo_derivatives`).get() as { bytes: number };
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const last30d = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(file_size),0) AS bytes FROM photos WHERE deleted_at IS NULL AND uploaded_at >= ?`).get(cutoff) as { c: number; bytes: number };

  let nasFreeBytes: number | null = null;
  let nasTotalBytes: number | null = null;
  const webdav = isWebDavConfigured();
  if (!webdav) {
    try {
      // Node 18.15+/20+ 지원. 이 값이 없는 구버전 Node에서 돌아가면 조용히 null로 남긴다.
      const statfs = (fs as unknown as { statfsSync?: (p: string) => { bavail: number; bsize: number; blocks: number } }).statfsSync;
      if (statfs) {
        const root = localUploadRoot();
        fs.mkdirSync(root, { recursive: true });
        const st = statfs(root);
        nasFreeBytes = st.bavail * st.bsize;
        nasTotalBytes = st.blocks * st.bsize;
      }
    } catch { /* 알 수 없음 — null 유지 */ }
  }

  return {
    totalPhotos: active.c,
    trashedPhotos: trashed.c,
    originalBytes: active.bytes,
    derivativeBytes: derivBytes.bytes,
    totalBytes: active.bytes + derivBytes.bytes,
    last30dPhotos: last30d.c,
    last30dBytes: last30d.bytes,
    nasMode: webdav ? 'webdav' : 'local',
    nasFreeBytes, nasTotalBytes,
    nasFreePercent: nasFreeBytes != null && nasTotalBytes ? (nasFreeBytes / nasTotalBytes) * 100 : null,
  };
}
