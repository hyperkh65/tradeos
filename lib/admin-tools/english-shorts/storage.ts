import { nasUpload, nasDownload, nasDelete, type NasUploadResult } from '@/lib/storage/nas';

/**
 * Admin Tools 전용 NAS 저장 루트 — 기존 UPLOAD_DIR(=lib/storage/nas.ts가 쓰는
 * 로컬/WebDAV 베이스) 아래 하위 폴더로 둔다(사진첩 lib/photos/storage.ts와 동일
 * 원리). 새 최상위 data/ 폴더를 만들지 않아 DR 백업 레지스트리(uploads
 * known-subdir)에 자동으로 포함된다 — 별도 등록 불필요.
 */
export const ADMIN_TOOLS_STORAGE_ROOT = process.env.ADMIN_TOOLS_STORAGE_ROOT?.trim() || 'admin-tools';
export const ENGLISH_SHORTS_ROOT = `${ADMIN_TOOLS_STORAGE_ROOT}/english-shorts`;

function extOf(fileName: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return (m?.[1] || 'bin').toLowerCase();
}

/** 소스 클립 원본: english-shorts/sources/original/{yyyy}/{sourceId}.{ext} */
export function buildSourcePath(sourceId: string, originalFileName: string): string {
  const year = new Date().getFullYear();
  return `${ENGLISH_SHORTS_ROOT}/sources/original/${year}/${sourceId}.${extOf(originalFileName)}`;
}

/** 렌더 결과물: english-shorts/renders/output/{yyyy}/{projectId}/{jobId}.mp4 */
export function buildRenderOutputPath(projectId: string, jobId: string): string {
  const year = new Date().getFullYear();
  return `${ENGLISH_SHORTS_ROOT}/renders/output/${year}/${projectId}/${jobId}.mp4`;
}

/** 렌더 썸네일: english-shorts/renders/thumbnail/{yyyy}/{projectId}/{jobId}.jpg */
export function buildRenderThumbnailPath(projectId: string, jobId: string): string {
  const year = new Date().getFullYear();
  return `${ENGLISH_SHORTS_ROOT}/renders/thumbnail/${year}/${projectId}/${jobId}.jpg`;
}

/** 자막 번인용 한글 폰트가 워커 컨테이너와 공유하는 bind mount 안에 살 위치. */
export function buildFontStagingPath(): string {
  return `${ENGLISH_SHORTS_ROOT}/fonts/NotoSansKR-Bold.otf`;
}

/** 렌더 중간 산출물(ASS 자막, 정규화된 클립 등) 임시 작업 디렉터리 — 성공/실패
 * 후 정리 대상(요청서 52번), 실패 분석에 필요한 최소 로그는 DB(es_render_logs)에
 * 남기고 여기 파일 자체는 지운다. */
export function buildRenderWorkDir(jobId: string): string {
  return `${ENGLISH_SHORTS_ROOT}/tmp/${jobId}`;
}

export async function uploadEnglishShortsFile(relativePath: string, buffer: Buffer, contentType: string): Promise<NasUploadResult> {
  return nasUpload(relativePath, buffer, contentType);
}

export async function downloadEnglishShortsFile(storedPath: string): Promise<Buffer | null> {
  return nasDownload(storedPath);
}

export async function deleteEnglishShortsFile(storedPath: string): Promise<boolean> {
  return nasDelete(storedPath);
}
