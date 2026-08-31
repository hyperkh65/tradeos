import { nasUpload, nasDownload, nasDelete, type NasUploadResult } from '@/lib/storage/nas';

/**
 * 사진첩 전용 NAS 저장 루트 — 기존 UPLOAD_DIR(=lib/storage/nas.ts가 쓰는 로컬/WebDAV
 * 베이스) 아래 하위 폴더로 둔다. 새 최상위 data/ 폴더를 만들지 않아 DR 백업 레지스트리
 * (lib/backup/registry.ts의 attachments 도메인 + uploads known-subdir)에 자동으로
 * 포함된다 — 별도 등록 불필요.
 */
export const PHOTO_STORAGE_ROOT = process.env.PHOTO_STORAGE_ROOT?.trim() || 'photos';

export type PhotoDerivativeKind = 'thumb_small' | 'thumb_medium' | 'preview_large' | 'watermarked';

function extOf(fileName: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return (m?.[1] || 'bin').toLowerCase();
}

/** 원본 저장 경로: photos/original/{yyyy}/{photoId}.{ext} */
export function buildOriginalPath(photoId: string, originalFileName: string): string {
  const year = new Date().getFullYear();
  return `${PHOTO_STORAGE_ROOT}/original/${year}/${photoId}.${extOf(originalFileName)}`;
}

/** 파생본(썸네일/프리뷰/워터마크) 저장 경로: photos/derivative/{kind}/{photoId}.webp */
export function buildDerivativePath(photoId: string, kind: PhotoDerivativeKind): string {
  return `${PHOTO_STORAGE_ROOT}/derivative/${kind}/${photoId}.webp`;
}

export async function uploadPhotoFile(relativePath: string, buffer: Buffer, contentType: string): Promise<NasUploadResult> {
  return nasUpload(relativePath, buffer, contentType);
}

export async function downloadPhotoFile(storedPath: string): Promise<Buffer | null> {
  return nasDownload(storedPath);
}

export async function deletePhotoFile(storedPath: string): Promise<boolean> {
  return nasDelete(storedPath);
}
